import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    console.log('\n🧪 TESTING MAIL WEBHOOK PROCESSING')
    console.log('=====================================\n')

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

    console.log(`Using subscription: ${subscription.id.substring(0, 8)}...`)
    console.log(`User ID: ${subscription.user_id.substring(0, 8)}...`)

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

    console.log('📧 Test mail notification:', testNotification)

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
      console.error('❌ Failed to insert test notification:', queueError)
      return NextResponse.json({ error: 'Failed to create test notification' }, { status: 500 })
    }

    console.log('✅ Test notification queued:', queueItem.id)

    // Trigger the worker to process the queue
    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const workerResponse = await fetch(`${base}/api/microsoft-graph/worker`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })

    if (!workerResponse.ok) {
      console.error('❌ Worker failed:', workerResponse.status, workerResponse.statusText)
      return NextResponse.json({ error: 'Worker failed' }, { status: 500 })
    }

    const workerResult = await workerResponse.json()
    console.log('✅ Worker result:', workerResult)

    // Check if events were created
    const { data: events } = await supabase
      .from('microsoft_graph_events')
      .select('*')
      .eq('user_id', subscription.user_id)
      .order('created_at', { ascending: false })
      .limit(5)

    console.log('📊 Recent events:', events?.length || 0)
    if (events && events.length > 0) {
      console.log('📧 Latest event:', {
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
    console.error('❌ Mail webhook test error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
