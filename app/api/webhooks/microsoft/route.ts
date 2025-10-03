import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MicrosoftGraphSubscriptionManager } from '@/lib/microsoft-graph/subscriptionManager'
import { getWebhookBaseUrl } from '@/lib/utils/getBaseUrl'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const subscriptionManager = new MicrosoftGraphSubscriptionManager()

// Helper function - hoisted above POST handler to avoid TDZ
async function logWebhookExecution(
  provider: string,
  payload: any,
  headers: any,
  status: string,
  executionTime: number
): Promise<void> {
  try {
    await supabase
      .from('webhook_logs')
      .insert({
        provider: provider,
        payload: payload,
        headers: headers,
        status: status,
        execution_time: executionTime,
        timestamp: new Date().toISOString()
      })
  } catch (error) {
    console.error('Failed to log webhook execution:', error)
  }
}

// Helper function - process notifications async
async function processNotifications(
  notifications: any[],
  headers: any,
  requestId: string | undefined
): Promise<void> {
  for (const change of notifications) {
    try {
      console.log('🔍 Processing notification:', {
        subscriptionId: change?.subscriptionId,
        changeType: change?.changeType,
        resource: change?.resource,
        hasClientState: !!change?.clientState,
        resourceData: change?.resourceData
      })
      const subId: string | undefined = change?.subscriptionId
      const changeType: string | undefined = change?.changeType
      const resource: string | undefined = change?.resource
      const bodyClientState: string | undefined = change?.clientState

      // Resolve user and verify clientState from trigger_resources
      let userId: string | null = null
      let workflowId: string | null = null
      if (subId) {
        console.log('🔍 Looking up subscription:', subId)
        const { data: subscription, error: subError } = await supabase
          .from('trigger_resources')
          .select('user_id, workflow_id, config')
          .eq('external_id', subId)
          .eq('resource_type', 'subscription')
          .like('provider_id', 'microsoft%')
          .single()

        if (subError) {
          console.error('❌ Error fetching subscription:', subError)
        }

        // Verify clientState if present
        if (bodyClientState && subscription?.config?.clientState) {
          if (bodyClientState !== subscription.config.clientState) {
            console.warn('⚠️ Invalid clientState for notification, skipping', {
              subId,
              expected: subscription.config.clientState,
              received: bodyClientState
            })
            continue
          }
        }

        userId = subscription?.user_id || null
        workflowId = subscription?.workflow_id || null
        console.log('👤 Resolved user from subscription:', {
          subscriptionId: subId,
          userId,
          workflowId,
          subscriptionFound: !!subscription
        })
      }

      // Enhanced dedup per notification - use message/resource ID to prevent duplicate processing across multiple subscriptions
      const messageId = change?.resourceData?.id || change?.resourceData?.['@odata.id'] || resource || 'unknown'
      // Deduplicate based on user + message + changeType (ignore subscription ID to catch duplicates across multiple subscriptions)
      const dedupKey = `${userId || 'unknown'}:${messageId}:${changeType || 'unknown'}`

      console.log('🔑 Deduplication check:', {
        dedupKey,
        messageId,
        changeType,
        subscriptionId: subId,
        userId
      })

      const { data: dedupHit } = await supabase
        .from('microsoft_webhook_dedup')
        .select('dedup_key')
        .eq('dedup_key', dedupKey)
        .maybeSingle()
      if (dedupHit) {
        console.log('⏭️ Skipping duplicate notification (message already processed):', {
          dedupKey,
          messageId,
          subscriptionId: subId
        })
        continue
      }
      await supabase.from('microsoft_webhook_dedup').insert({ dedup_key: dedupKey })

      // Enqueue processing for this notification
      console.log('📥 Inserting into queue:', {
        userId,
        subscriptionId: subId,
        resource,
        changeType,
        hasPayload: !!change
      })

      const { data: queueItem, error: queueError } = await supabase.from('microsoft_webhook_queue').insert({
        user_id: userId,
        subscription_id: subId,
        resource: resource,
        change_type: changeType,
        payload: change,
        headers,
        status: 'pending'
      }).select().single()

      if (queueError) {
        console.error('❌ Failed to queue notification:', {
          error: queueError,
          code: queueError.code,
          message: queueError.message,
          details: queueError.details
        })
      } else {
        console.log('✅ Notification queued successfully:', {
          queueId: queueItem?.id,
          userId: queueItem?.user_id,
          status: queueItem?.status
        })
      }
    } catch (error) {
      console.error('❌ Error processing individual notification:', error)
    }
  }

  // Kick off background worker after all notifications processed
  try {
    const base = getWebhookBaseUrl()
    const workerUrl = `${base}/api/microsoft-graph/worker`
    console.log('🚀 Triggering background worker:', workerUrl)

    // Small delay to ensure queue items are committed
    setTimeout(async () => {
      try {
        const res = await fetch(workerUrl, { method: 'POST' })
        console.log('✅ Worker triggered, status:', res.status)
      } catch (err) {
        console.error('❌ Worker trigger failed:', err)
      }
    }, 100) // 100ms delay to ensure DB commit
  } catch (error) {
    console.error('❌ Worker trigger error:', error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const validationToken = url.searchParams.get('validationToken') || url.searchParams.get('validationtoken')
    const body = await request.text()
    const headers = Object.fromEntries(request.headers.entries())

    console.log('📥 Microsoft Graph webhook received:', {
      headers: Object.keys(headers),
      bodyLength: body.length,
      timestamp: new Date().toISOString()
    })

    // Handle validation request from Microsoft (either via validationToken query or text/plain body)
    if (validationToken || headers['content-type']?.includes('text/plain')) {
      const token = validationToken || body
      console.log('🔍 Validation request received')
      return new NextResponse(token, { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }

    // Handle empty body (some Microsoft notifications are empty)
    if (!body || body.length === 0) {
      console.log('⚠️ Empty webhook payload received, skipping')
      return NextResponse.json({ success: true, empty: true })
    }

    // Parse payload
    let payload: any
    try {
      payload = JSON.parse(body)
    } catch (error) {
      console.error('❌ Failed to parse webhook payload:', error)
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    // Notifications arrive as an array in payload.value
    const notifications: any[] = Array.isArray(payload?.value) ? payload.value : []
    console.log('📋 Webhook payload analysis:', {
      hasValue: !!payload?.value,
      valueIsArray: Array.isArray(payload?.value),
      notificationCount: notifications.length,
      payloadKeys: Object.keys(payload || {}),
      sampleNotification: notifications[0] || null
    })

    if (notifications.length === 0) {
      console.warn('⚠️ Microsoft webhook payload has no notifications (value array empty)')
      return NextResponse.json({ success: true, empty: true })
    }

    const requestId = headers['request-id'] || headers['client-request-id'] || undefined

    // Process notifications synchronously (fast enough for serverless)
    const startTime = Date.now()
    try {
      await processNotifications(notifications, headers, requestId)
      await logWebhookExecution('microsoft-graph', payload, headers, 'queued', Date.now() - startTime)

      // Return 202 after processing
      return new NextResponse(null, { status: 202 })
    } catch (error) {
      console.error('❌ Notification processing error:', error)
      await logWebhookExecution('microsoft-graph', payload, headers, 'error', Date.now() - startTime)
      return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
    }

  } catch (error: any) {
    console.error('❌ Microsoft Graph webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const validationToken = url.searchParams.get('validationToken') || url.searchParams.get('validationtoken')
  if (validationToken) {
    console.log('🔍 Validation request (GET) received')
    return new NextResponse(validationToken, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }

  return NextResponse.json({
    message: "Microsoft Graph webhook endpoint active",
    provider: "microsoft-graph",
    methods: ["POST"],
    timestamp: new Date().toISOString(),
    description: "Webhook endpoint for Microsoft Graph workflows. Send POST requests to trigger workflows."
  })
}