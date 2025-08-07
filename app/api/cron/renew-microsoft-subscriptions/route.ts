import { NextRequest, NextResponse } from 'next/server'
import { MicrosoftGraphSubscriptionManager } from '@/lib/microsoft-graph/subscriptionManager'

const subscriptionManager = new MicrosoftGraphSubscriptionManager()

export async function POST(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request (you can add additional verification)
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET_TOKEN
    
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('🔄 Starting Microsoft Graph subscription renewal process')

    // Get subscriptions that need renewal (expiring within 24 hours)
    const subscriptionsNeedingRenewal = await subscriptionManager.getSubscriptionsNeedingRenewal()
    
    console.log(`📊 Found ${subscriptionsNeedingRenewal.length} subscriptions needing renewal`)

    const results = {
      total: subscriptionsNeedingRenewal.length,
      renewed: 0,
      failed: 0,
      errors: [] as string[]
    }

    // Process each subscription
    for (const subscription of subscriptionsNeedingRenewal) {
      try {
        console.log(`🔄 Renewing subscription: ${subscription.id}`)
        
        // Note: In production, you should refresh the access token here
        // For now, we'll use the stored token (which may be expired)
        await subscriptionManager.renewSubscription(subscription.id, subscription.accessToken)
        
        results.renewed++
        console.log(`✅ Successfully renewed subscription: ${subscription.id}`)
        
      } catch (error: any) {
        results.failed++
        const errorMessage = `Failed to renew subscription ${subscription.id}: ${error.message}`
        results.errors.push(errorMessage)
        console.error(`❌ ${errorMessage}`)
        
        // If token is expired, mark subscription for cleanup
        if (error.message.includes('401')) {
          console.log(`🗑️ Marking expired subscription for cleanup: ${subscription.id}`)
          // You might want to delete or mark as expired
        }
      }
    }

    // Clean up expired subscriptions
    await subscriptionManager.cleanupExpiredSubscriptions()

    console.log('✅ Microsoft Graph subscription renewal process completed:', results)

    return NextResponse.json({
      success: true,
      message: 'Subscription renewal process completed',
      results
    })

  } catch (error: any) {
    console.error('❌ Error in subscription renewal process:', error)
    return NextResponse.json({ 
      error: 'Failed to process subscription renewals',
      details: error.message 
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: "Microsoft Graph subscription renewal endpoint",
    description: "POST to this endpoint to renew subscriptions that are expiring soon",
    cron_schedule: "Every 6 hours (recommended)",
    timestamp: new Date().toISOString()
  })
}
