import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'

import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    logger.debug('\n🧪 MANUALLY TRIGGERING ONEDRIVE WEBHOOK TEST')

    // Get the active subscription
    const { data: subscriptions } = await supabase
      .from('microsoft_graph_subscriptions')
      .select('id, user_id, client_state')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)

    const subscription = subscriptions?.[0]
    if (!subscription) {
      return errorResponse('No active subscription found' , 400)
    }

    logger.debug(`Using subscription: ${subscription.id.substring(0, 8)}...`)
    logger.debug(`User ID: ${subscription.user_id.substring(0, 8)}...`)

    // Create a test notification that mimics Microsoft's format
    const testNotification = {
      subscriptionId: subscription.id,
      changeType: 'updated',
      resource: `/me/drive/root`,
      clientState: subscription.client_state,
      resourceData: {
        '@odata.type': '#Microsoft.Graph.driveItem',
        '@odata.id': 'drive/root/children/test-file.txt'
      }
    }

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
      logger.error('Failed to insert queue item:', queueError)
      return errorResponse(queueError , 500)
    }

    logger.debug('✅ Test webhook queued with ID:', queueItem.id)

    // Now trigger the worker to process it
    const workerUrl = new URL(request.url)
    workerUrl.pathname = '/api/microsoft-graph/worker'

    logger.debug('🔄 Triggering worker to process queue...')
    const workerResponse = await fetch(workerUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })

    const workerResult = await workerjsonResponse()
    logger.debug('Worker response:', workerResult)

    return jsonResponse({
      success: true,
      queueItemId: queueItem.id,
      subscriptionId: subscription.id,
      userId: subscription.user_id,
      workerResult,
      message: 'Test webhook queued and worker triggered. Check logs for workflow execution.'
    })

  } catch (error) {
    logger.error('Test trigger error:', error)
    return jsonResponse({ error }, { status: 500 })
  }
}

export async function GET() {
  return jsonResponse({
    message: 'POST to this endpoint to manually trigger a test OneDrive webhook'
  })
}