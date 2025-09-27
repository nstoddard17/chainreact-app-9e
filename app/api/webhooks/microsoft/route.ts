import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MicrosoftGraphSubscriptionManager } from '@/lib/microsoft-graph/subscriptionManager'
import { getWebhookBaseUrl } from '@/lib/utils/getBaseUrl'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const subscriptionManager = new MicrosoftGraphSubscriptionManager()

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

    // Handle actual webhook notifications
    let payload: any

    // Handle empty body (some Microsoft notifications are empty)
    if (!body || body.length === 0) {
      console.log('⚠️ Empty webhook payload received, skipping')
      return NextResponse.json({ success: true, empty: true })
    }

    try {
      payload = JSON.parse(body)
    } catch (error) {
      console.error('❌ Failed to parse webhook payload:', error)
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    // Notifications arrive as an array in payload.value
    const notifications: any[] = Array.isArray(payload?.value) ? payload.value : []
    if (notifications.length === 0) {
      console.warn('⚠️ Microsoft webhook payload has no notifications (value array empty)')
      return NextResponse.json({ success: true, empty: true })
    }

    const requestId = headers['request-id'] || headers['client-request-id'] || undefined

    for (const change of notifications) {
      const subId: string | undefined = change?.subscriptionId
      const changeType: string | undefined = change?.changeType
      const resource: string | undefined = change?.resource
      const bodyClientState: string | undefined = change?.clientState

      if (subId && bodyClientState) {
        const isValid = await subscriptionManager.verifyClientState(bodyClientState, subId)
        if (!isValid) {
          console.warn('⚠️ Invalid clientState for notification, skipping', { subId })
          continue
        }
      }

      // Dedup per notification
      const dedupKey = `${subId || 'unknown'}:${resource || 'unknown'}:${changeType || 'unknown'}:${requestId || ''}`
      const { data: dedupHit } = await supabase
        .from('microsoft_webhook_dedup')
        .select('dedup_key')
        .eq('dedup_key', dedupKey)
        .maybeSingle()
      if (dedupHit) {
        continue
      }
      await supabase.from('microsoft_webhook_dedup').insert({ dedup_key: dedupKey })

      // Resolve user from subscription
      let userId: string | null = null
      if (subId) {
        const { data: subscription } = await supabase
          .from('microsoft_graph_subscriptions')
          .select('user_id')
          .eq('id', subId)
          .single()
        userId = subscription?.user_id || null
      }

      // Enqueue processing for this notification
      await supabase.from('microsoft_webhook_queue').insert({
        user_id: userId,
        subscription_id: subId,
        resource: resource,
        change_type: changeType,
        payload: change,
        headers,
        status: 'pending'
      })
    }

    // Kick off background worker to process the queue immediately (best-effort)
    try {
      const base = getWebhookBaseUrl()
      // Fire-and-forget; do not await to keep webhook fast
      fetch(`${base}/api/microsoft-graph/worker`, { method: 'POST' }).catch(() => {})
    } catch {
      // ignore worker trigger errors
    }

    // Log the webhook execution
    await logWebhookExecution(
      'microsoft-graph',
      payload,
      headers,
      'queued',
      Date.now()
    )

    return NextResponse.json({
      success: true,
      provider: 'microsoft-graph',
      message: 'Webhook received and queued for processing'
    })

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