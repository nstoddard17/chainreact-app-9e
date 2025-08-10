import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MicrosoftGraphSubscriptionManager } from '@/lib/microsoft-graph/subscriptionManager'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const manager = new MicrosoftGraphSubscriptionManager()

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = req.headers.get('authorization')
    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET_TOKEN}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId } = await req.json()
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    // Get all subscriptions for user
    const subscriptions = await manager.getUserSubscriptions(userId)
    
    // Get user token
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token, refresh_token')
      .eq('user_id', userId)
      .eq('provider', 'microsoft')
      .single()
      
    if (!integration) {
      await notifySubscriptionIssue(userId, 'No Microsoft integration found')
      return NextResponse.json({ error: 'Microsoft integration not found' }, { status: 404 })
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
        const expirationDate = new Date(sub.expirationDateTime)
        const now = new Date()
        const hoursUntilExpiration = (expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60)
        
        if (hoursUntilExpiration < 24) {
          await manager.renewSubscription(sub.id, integration.access_token)
          results.renewed++
        }
      } catch (error: any) {
        results.failed++
        results.errors.push(`Failed to renew subscription ${sub.id}: ${error.message}`)
      }
    }

    // If we have failures, notify the user
    if (results.failed > 0) {
      await notifySubscriptionIssue(
        userId, 
        `${results.failed} out of ${results.checked} Microsoft Graph subscriptions failed to renew`
      )
    }

    return NextResponse.json({
      success: true,
      ...results
    })
  } catch (error: any) {
    console.error('Microsoft Graph health check error:', error)
    return NextResponse.json({ error: error.message || 'Health check failed' }, { status: 500 })
  }
}

// Endpoint to check all subscriptions (for cron job)
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = req.headers.get('authorization')
    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET_TOKEN}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all active subscriptions across users
    const { data: subscriptions } = await supabase
      .from('microsoft_graph_subscriptions')
      .select('id, user_id, expiration_date_time')
      .eq('status', 'active')
    
    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ message: 'No active subscriptions found' })
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
      
      // Get user token
      const { data: integration } = await supabase
        .from('integrations')
        .select('access_token')
        .eq('user_id', userId)
        .eq('provider', 'microsoft')
        .single()
        
      if (!integration) {
        results.errors.push(`User ${userId} has no Microsoft integration`)
        continue
      }

      // Check each subscription
      for (const sub of subs) {
        results.subscriptionsChecked++
        
        try {
          // Check if subscription is expiring soon (within 24 hours)
          const expirationDate = new Date(sub.expiration_date_time)
          const now = new Date()
          const hoursUntilExpiration = (expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60)
          
          if (hoursUntilExpiration < 24) {
            await manager.renewSubscription(sub.id, integration.access_token)
            results.subscriptionsRenewed++
          }
        } catch (error: any) {
          results.subscriptionsFailed++
          results.errors.push(`Failed to renew subscription ${sub.id} for user ${userId}: ${error.message}`)
          
          // Notify user of issue
          await notifySubscriptionIssue(userId, `Failed to renew Microsoft Graph subscription: ${error.message}`)
        }
      }
    }

    return NextResponse.json({
      success: true,
      ...results
    })
  } catch (error: any) {
    console.error('Microsoft Graph health check error:', error)
    return NextResponse.json({ error: error.message || 'Health check failed' }, { status: 500 })
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
    console.error('Failed to create notification:', error)
  }
}
