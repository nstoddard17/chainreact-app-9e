import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { MicrosoftGraphSubscriptionManager } from '@/lib/microsoft-graph/subscriptionManager'

import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const subscriptionManager = new MicrosoftGraphSubscriptionManager()

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = req.headers.get('authorization')
    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET_TOKEN}`) {
      return errorResponse('Unauthorized' , 401)
    }

    logger.debug('🔄 Starting Microsoft Graph subscription renewal cron job')

    // Clean up expired subscriptions
    await subscriptionManager.cleanupExpiredSubscriptions()

    // Get subscriptions that need renewal
    const subscriptions = await subscriptionManager.getSubscriptionsNeedingRenewal()
    
    if (subscriptions.length === 0) {
      logger.debug('✅ No Microsoft Graph subscriptions need renewal')
      return jsonResponse({ message: 'No subscriptions need renewal' })
    }

    logger.debug(`🔄 Found ${subscriptions.length} subscriptions that need renewal`)

    // Group subscriptions by user ID to minimize token fetching
    const userSubscriptions: Record<string, any[]> = {}
    subscriptions.forEach(sub => {
      if (!userSubscriptions[sub.userId]) {
        userSubscriptions[sub.userId] = []
      }
      userSubscriptions[sub.userId].push(sub)
    })

    const results = {
      total: subscriptions.length,
      renewed: 0,
      failed: 0,
      errors: [] as string[]
    }

    // Process each user's subscriptions
    for (const [userId, subs] of Object.entries(userSubscriptions)) {
      // Get fresh access token for user
      const { data: integration } = await supabase
        .from('integrations')
        .select('access_token, refresh_token')
        .eq('user_id', userId)
        .eq('provider', 'microsoft')
        .single()

      if (!integration) {
        logger.debug(`❌ No Microsoft integration found for user ${userId}`)
        results.failed += subs.length
        subs.forEach(sub => {
          results.errors.push(`No Microsoft integration found for user ${userId}, subscription ${sub.id}`)
        })
        continue
      }

      // Renew each subscription for this user
      for (const sub of subs) {
        try {
          await subscriptionManager.renewSubscription(sub.id, integration.access_token)
          results.renewed++
          logger.debug(`✅ Renewed subscription ${sub.id} for user ${userId}`)
        } catch (error: any) {
          results.failed++
          const errorMessage = `Failed to renew subscription ${sub.id} for user ${userId}: ${error.message}`
          results.errors.push(errorMessage)
          logger.error(`❌ ${errorMessage}`)

          // Notify user of the issue
          await notifySubscriptionIssue(userId, `Failed to renew Microsoft Graph subscription: ${error.message}`)
        }
      }
    }

    logger.debug(`🏁 Microsoft Graph subscription renewal complete: ${results.renewed} renewed, ${results.failed} failed`)

    return jsonResponse({
      success: true,
      ...results
    })
  } catch (error: any) {
    logger.error('❌ Microsoft Graph subscription renewal error:', error)
    return errorResponse(error.message || 'Renewal failed' , 500)
  }
}

// Helper function to notify user of subscription issues
async function notifySubscriptionIssue(userId: string, message: string): Promise<void> {
  try {
    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'microsoft_graph_subscription_issue',
      title: 'Microsoft Graph Subscription Issue',
      message: message,
      status: 'unread',
      created_at: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to create notification:', error)
  }
}
