import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { MicrosoftGraphSubscriptionManager } from '@/lib/microsoft-graph/subscriptionManager'

import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

const manager = new MicrosoftGraphSubscriptionManager()

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = req.headers.get('authorization')
    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET_TOKEN}`) {
      return errorResponse('Unauthorized' , 401)
    }

    const { userId } = await req.json()
    if (!userId) {
      return errorResponse('Missing userId' , 400)
    }

    // Get all subscriptions for user from trigger_resources
    const { data: subscriptions } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('user_id', userId)
      .eq('resource_type', 'subscription')
      .like('provider_id', 'microsoft%')
      .eq('status', 'active')

    if (!subscriptions || subscriptions.length === 0) {
      return jsonResponse({ message: 'No active Microsoft Graph subscriptions found for user' })
    }

    // Get user token (check multiple Microsoft providers)
    const { data: integrations } = await supabase
      .from('integrations')
      .select('access_token, refresh_token, provider')
      .eq('user_id', userId)
      .or('provider.like.microsoft%,provider.eq.onedrive')

    const integration = integrations?.find(i => i.access_token)

    if (!integration) {
      await notifySubscriptionIssue(userId, 'No Microsoft integration found')
      return errorResponse('Microsoft integration not found' , 404)
    }

    // Check each subscription and renew if needed
    const results = {
      checked: 0,
      renewed: 0,
      failed: 0,
      errors: [] as string[]
    }

    for (const sub of subscriptions) {
      results.checked++

      try {
        // Check if subscription is expiring soon (within 24 hours)
        const expirationDate = sub.expires_at ? new Date(sub.expires_at) : null
        if (!expirationDate) continue

        const now = new Date()
        const hoursUntilExpiration = (expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60)

        if (hoursUntilExpiration < 24 && sub.external_id) {
          await manager.renewSubscription(sub.external_id, integration.access_token)
          results.renewed++
        }
      } catch (error: any) {
        results.failed++
        results.errors.push(`Failed to renew subscription ${sub.external_id}: ${error.message}`)
      }
    }

    // If we have failures, notify the user
    if (results.failed > 0) {
      await notifySubscriptionIssue(
        userId, 
        `${results.failed} out of ${results.checked} Microsoft Graph subscriptions failed to renew`
      )
    }

    return jsonResponse({
      success: true,
      ...results
    })
  } catch (error: any) {
    logger.error('Microsoft Graph health check error:', error)
    return errorResponse(error.message || 'Health check failed' , 500)
  }
}

// Endpoint to check all subscriptions (for cron job)
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = req.headers.get('authorization')
    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET_TOKEN}`) {
      return errorResponse('Unauthorized' , 401)
    }

    // Get all active subscriptions across users from trigger_resources
    const { data: subscriptions } = await supabase
      .from('trigger_resources')
      .select('external_id, user_id, expires_at')
      .eq('resource_type', 'subscription')
      .like('provider_id', 'microsoft%')
      .eq('status', 'active')

    if (!subscriptions || subscriptions.length === 0) {
      return jsonResponse({ message: 'No active subscriptions found' })
    }

    // Group subscriptions by user
    const userSubscriptions: Record<string, any[]> = {}
    subscriptions.forEach(sub => {
      if (!userSubscriptions[sub.user_id]) {
        userSubscriptions[sub.user_id] = []
      }
      userSubscriptions[sub.user_id].push(sub)
    })

    // Process each user's subscriptions
    const results = {
      usersChecked: 0,
      subscriptionsChecked: 0,
      subscriptionsRenewed: 0,
      subscriptionsFailed: 0,
      errors: [] as string[]
    }

    for (const [userId, subs] of Object.entries(userSubscriptions)) {
      results.usersChecked++
      
      // Get user token (check multiple Microsoft providers)
      const { data: integrations } = await supabase
        .from('integrations')
        .select('access_token, provider')
        .eq('user_id', userId)
        .or('provider.like.microsoft%,provider.eq.onedrive')

      const integration = integrations?.find(i => i.access_token)

      if (!integration) {
        results.errors.push(`User ${userId} has no Microsoft integration`)
        continue
      }

      // Check each subscription
      for (const sub of subs) {
        results.subscriptionsChecked++

        try {
          // Check if subscription is expiring soon (within 24 hours)
          const expirationDate = sub.expires_at ? new Date(sub.expires_at) : null
          if (!expirationDate) continue

          const now = new Date()
          const hoursUntilExpiration = (expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60)

          if (hoursUntilExpiration < 24 && sub.external_id) {
            await manager.renewSubscription(sub.external_id, integration.access_token)
            results.subscriptionsRenewed++
          }
        } catch (error: any) {
          results.subscriptionsFailed++
          results.errors.push(`Failed to renew subscription ${sub.external_id} for user ${userId}: ${error.message}`)

          // Notify user of issue
          await notifySubscriptionIssue(userId, `Failed to renew Microsoft Graph subscription: ${error.message}`)
        }
      }
    }

    return jsonResponse({
      success: true,
      ...results
    })
  } catch (error: any) {
    logger.error('Microsoft Graph health check error:', error)
    return errorResponse(error.message || 'Health check failed' , 500)
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
