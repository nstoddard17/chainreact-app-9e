import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    logger.debug('\n🧪 TESTING MAIL WEBHOOK PROCESSING')
    logger.debug('=====================================\n')

    // Get the active subscription
    const { data: subscriptions } = await supabase
      .from('microsoft_graph_subscriptions')
      .select('id, user_id, client_state')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)

    const subscription = subscriptions?.[0]
    if (!subscription) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 400 })
    }

    logger.debug(`Using subscription: ${subscription.id.substring(0, 8)}...`)
    logger.debug(`User ID: ${subscription.user_id.substring(0, 8)}...`)

    // Create a test mail notification that mimics Microsoft's format
    const testNotification = {
      subscriptionId: subscription.id,
      changeType: 'created',
      resource: `/me/messages`,
      clientState: subscription.client_state,
      resourceData: {
        '@odata.type': '#Microsoft.Graph.message',
        '@odata.id': 'messages/test-email-id'
      }
    }

    logger.debug('📧 Test mail notification:', testNotification)

    // Insert directly into the webhook queue (bypass the webhook receiver)
    const { data: queueItem, error: queueError } = await supabase
      .from('microsoft_webhook_queue')
      .insert({
        user_id: subscription.user_id,
        subscription_id: subscription.id,
        resource: testNotification.resource,
        change_type: testNotification.changeType,
        payload: testNotification,
        headers: {},
        status: 'pending'
      })
      .select()
      .single()

    if (queueError) {
      logger.error('❌ Failed to insert test notification:', queueError)
      return NextResponse.json({ error: 'Failed to create test notification' }, { status: 500 })
    }

    logger.debug('✅ Test notification queued:', queueItem.id)

    // Trigger the worker to process the queue
    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const workerResponse = await fetch(`${base}/api/microsoft-graph/worker`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })

    if (!workerResponse.ok) {
      logger.error('❌ Worker failed:', workerResponse.status, workerResponse.statusText)
      return NextResponse.json({ error: 'Worker failed' }, { status: 500 })
    }

    const workerResult = await workerResponse.json()
    logger.debug('✅ Worker result:', workerResult)

    // Check if events were created
    const { data: events } = await supabase
      .from('microsoft_graph_events')
      .select('*')
      .eq('user_id', subscription.user_id)
      .order('created_at', { ascending: false })
      .limit(5)

    logger.debug('📊 Recent events:', events?.length || 0)
    if (events && events.length > 0) {
      logger.debug('📧 Latest event:', {
        type: events[0].event_type,
        action: events[0].event_action,
        subject: events[0].payload?.subject
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Mail webhook test completed',
      queueItem: queueItem.id,
      workerResult,
      eventsFound: events?.length || 0
    })

  } catch (error: any) {
    logger.error('❌ Mail webhook test error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
