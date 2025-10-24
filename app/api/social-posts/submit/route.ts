import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'

interface SubmitSocialPostRequest {
  postUrl: string
  platform: 'twitter' | 'linkedin' | 'x'
}

/**
 * POST /api/social-posts/submit
 * Submit a social media post URL to claim free tasks
 * Grants tasks immediately, schedules verification for later
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body
    const body: SubmitSocialPostRequest = await request.json()
    const { postUrl, platform } = body

    // Validate inputs
    if (!postUrl || !platform) {
      return NextResponse.json(
        { error: 'Missing required fields: postUrl and platform' },
        { status: 400 }
      )
    }

    // Validate platform
    if (!['twitter', 'linkedin', 'x'].includes(platform)) {
      return NextResponse.json(
        { error: 'Invalid platform. Must be twitter, linkedin, or x' },
        { status: 400 }
      )
    }

    // Validate URL format
    const urlPattern = /^https?:\/\/.+/i
    if (!urlPattern.test(postUrl)) {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      )
    }

    // Check if user has already submitted this URL
    const { data: existingSubmission } = await supabase
      .from('social_post_submissions')
      .select('id')
      .eq('user_id', user.id)
      .eq('post_url', postUrl)
      .single()

    if (existingSubmission) {
      return NextResponse.json(
        { error: 'You have already submitted this post URL' },
        { status: 400 }
      )
    }

    // Check rate limiting - max 1 submission per week per user
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

    const { data: recentSubmissions } = await supabase
      .from('social_post_submissions')
      .select('id')
      .eq('user_id', user.id)
      .gte('created_at', oneWeekAgo.toISOString())

    if (recentSubmissions && recentSubmissions.length >= 1) {
      return NextResponse.json(
        { error: 'You can only submit one post per week. Please try again later.' },
        { status: 429 }
      )
    }

    const TASKS_TO_GRANT = 1500

    // Create submission record
    const { data: submission, error: submissionError } = await supabase
      .from('social_post_submissions')
      .insert({
        user_id: user.id,
        post_url: postUrl,
        platform,
        tasks_granted: TASKS_TO_GRANT,
        status: 'pending',
        verification_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
      })
      .select()
      .single()

    if (submissionError) {
      logger.error('Failed to create social post submission:', submissionError)
      return NextResponse.json(
        { error: 'Failed to submit post' },
        { status: 500 }
      )
    }

    // Grant tasks immediately to user's profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('tasks_limit, plan')
      .eq('id', user.id)
      .single()

    if (profileError) {
      logger.error('Failed to fetch user profile:', profileError)
      // Rollback submission
      await supabase.from('social_post_submissions').delete().eq('id', submission.id)
      return NextResponse.json(
        { error: 'Failed to update task limit' },
        { status: 500 }
      )
    }

    // Add tasks to user's limit
    const newTasksLimit = (profile.tasks_limit || 100) + TASKS_TO_GRANT

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        tasks_limit: newTasksLimit,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)

    if (updateError) {
      logger.error('Failed to update tasks limit:', updateError)
      // Rollback submission
      await supabase.from('social_post_submissions').delete().eq('id', submission.id)
      return NextResponse.json(
        { error: 'Failed to grant tasks' },
        { status: 500 }
      )
    }

    logger.info('Social post submitted successfully', {
      userId: user.id,
      postUrl,
      platform,
      tasksGranted: TASKS_TO_GRANT,
      submissionId: submission.id
    })

    return NextResponse.json({
      success: true,
      tasksGranted: TASKS_TO_GRANT,
      newTasksLimit,
      message: `${TASKS_TO_GRANT} tasks added! We'll verify your post in 7 days.`,
      verificationDate: submission.verification_date
    })

  } catch (error: any) {
    logger.error('Error in social post submission:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
