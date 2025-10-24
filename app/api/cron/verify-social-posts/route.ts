import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'

/**
 * GET /api/cron/verify-social-posts
 * Vercel Cron job to verify social media posts that were submitted 7+ days ago
 * Runs daily to check if posts still exist
 *
 * Add to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/verify-social-posts",
 *     "schedule": "0 2 * * *"
 *   }]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const supabase = await createSupabaseRouteHandlerClient()
    const now = new Date()

    // Get all pending submissions that are due for verification
    const { data: submissions, error: fetchError } = await supabase
      .from('social_post_submissions')
      .select('*')
      .eq('status', 'pending')
      .lte('verification_date', now.toISOString())
      .order('created_at', { ascending: true })
      .limit(100) // Process 100 at a time

    if (fetchError) {
      logger.error('Failed to fetch submissions for verification:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch submissions' },
        { status: 500 }
      )
    }

    if (!submissions || submissions.length === 0) {
      logger.info('No submissions to verify')
      return NextResponse.json({
        success: true,
        verified: 0,
        message: 'No submissions to verify'
      })
    }

    const results = {
      verified: 0,
      deleted: 0,
      invalid: 0,
      errors: 0
    }

    // Process each submission
    for (const submission of submissions) {
      try {
        const postExists = await checkPostExists(submission.post_url, submission.platform)

        if (postExists === null) {
          // Could not verify (API error, rate limit, etc.)
          await supabase
            .from('social_post_submissions')
            .update({
              verification_attempts: (submission.verification_attempts || 0) + 1,
              last_verification_attempt: now.toISOString()
            })
            .eq('id', submission.id)

          results.errors++
          logger.warn('Could not verify post', { submissionId: submission.id, url: submission.post_url })
          continue
        }

        if (postExists) {
          // Post still exists - mark as verified
          await supabase
            .from('social_post_submissions')
            .update({
              status: 'verified',
              verification_attempts: (submission.verification_attempts || 0) + 1,
              last_verification_attempt: now.toISOString()
            })
            .eq('id', submission.id)

          results.verified++
          logger.info('Post verified successfully', { submissionId: submission.id })
        } else {
          // Post was deleted - revoke tasks
          await revokeTasksAndNotifyUser(supabase, submission)
          results.deleted++
          logger.warn('Post was deleted, tasks revoked', {
            submissionId: submission.id,
            userId: submission.user_id
          })
        }
      } catch (error: any) {
        logger.error('Error verifying submission', {
          submissionId: submission.id,
          error: error.message
        })
        results.errors++
      }
    }

    logger.info('Verification cron completed', results)

    return NextResponse.json({
      success: true,
      ...results,
      total: submissions.length
    })

  } catch (error: any) {
    logger.error('Error in verification cron:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Check if a social media post still exists
 * Returns: true if exists, false if deleted, null if unable to verify
 */
async function checkPostExists(url: string, platform: string): Promise<boolean | null> {
  try {
    // For Twitter/X posts
    if (platform === 'twitter' || platform === 'x') {
      return await checkTwitterPostExists(url)
    }

    // For LinkedIn posts
    if (platform === 'linkedin') {
      return await checkLinkedInPostExists(url)
    }

    return null
  } catch (error: any) {
    logger.error('Error checking post existence:', { url, platform, error: error.message })
    return null
  }
}

/**
 * Check if Twitter/X post exists
 */
async function checkTwitterPostExists(url: string): Promise<boolean | null> {
  try {
    // Simple approach: Try to fetch the URL and check response
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ChainReactBot/1.0; +https://chainreact.com)'
      }
    })

    // 200 = exists, 404 = deleted, other = unknown
    if (response.status === 200) return true
    if (response.status === 404) return false

    // For other statuses, return null (unable to verify)
    return null
  } catch (error) {
    logger.error('Error checking Twitter post:', error)
    return null
  }
}

/**
 * Check if LinkedIn post exists
 */
async function checkLinkedInPostExists(url: string): Promise<boolean | null> {
  try {
    // Similar approach for LinkedIn
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ChainReactBot/1.0; +https://chainreact.com)'
      }
    })

    if (response.status === 200) return true
    if (response.status === 404) return false

    return null
  } catch (error) {
    logger.error('Error checking LinkedIn post:', error)
    return null
  }
}

/**
 * Revoke tasks from user and update submission status
 */
async function revokeTasksAndNotifyUser(supabase: any, submission: any) {
  const tasksToRevoke = submission.tasks_granted || 1500

  // Get user's current profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('tasks_limit, email')
    .eq('id', submission.user_id)
    .single()

  if (profile) {
    // Deduct tasks (but don't go below base plan limit)
    const newTasksLimit = Math.max(100, (profile.tasks_limit || 100) - tasksToRevoke)

    await supabase
      .from('profiles')
      .update({
        tasks_limit: newTasksLimit,
        updated_at: new Date().toISOString()
      })
      .eq('id', submission.user_id)

    // Send notification email
    await sendRevocationEmail(profile.email, submission.post_url, tasksToRevoke)
  }

  // Update submission status
  await supabase
    .from('social_post_submissions')
    .update({
      status: 'revoked',
      verification_attempts: (submission.verification_attempts || 0) + 1,
      last_verification_attempt: new Date().toISOString()
    })
    .eq('id', submission.id)
}

/**
 * Send email notification about revoked tasks
 */
async function sendRevocationEmail(email: string, postUrl: string, tasksRevoked: number) {
  try {
    // Import email service
    const { sendEmail } = await import('@/lib/notifications/email')

    const subject = '⚠️ ChainReact: Tasks Revoked - Post No Longer Found'
    const message = `
Hello,

We recently verified your social media post submission and found that the post is no longer publicly available:

Post URL: ${postUrl}

As per our terms, we have revoked ${tasksRevoked} tasks from your account because the post was deleted.

To maintain the integrity of our free tasks program, we require that posts remain public for at least 7 days after submission.

If you believe this was an error, please contact support at hello@chainreact.com.

Thank you for understanding,
ChainReact Team
    `.trim()

    await sendEmail(email, subject, message)
    logger.info('Revocation email sent', { email, tasksRevoked })
  } catch (error) {
    logger.error('Failed to send revocation email:', error)
    // Don't throw - we still want to revoke tasks even if email fails
  }
}
