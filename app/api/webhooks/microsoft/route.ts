import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MicrosoftGraphSubscriptionManager } from '@/lib/microsoft-graph/subscriptionManager'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const subscriptionManager = new MicrosoftGraphSubscriptionManager()

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const headers = Object.fromEntries(request.headers.entries())
    
    console.log('📥 Microsoft Graph webhook received:', {
      headers: Object.keys(headers),
      bodyLength: body.length,
      timestamp: new Date().toISOString()
    })

    // Handle validation request from Microsoft
    if (headers['content-type']?.includes('text/plain')) {
      console.log('🔍 Validation request received')
      
      // Return the validation token as plain text
      return new NextResponse(body, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain'
        }
      })
    }

    // Handle actual webhook notifications
    let payload
    try {
      payload = JSON.parse(body)
    } catch (error) {
      console.error('❌ Failed to parse webhook payload:', error)
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    // Verify the webhook is from Microsoft: check clientState
    const clientState = headers['clientstate']
    if (clientState && payload.subscriptionId) {
      const isValid = await subscriptionManager.verifyClientState(clientState, payload.subscriptionId)
      if (!isValid) {
        console.warn('⚠️ Invalid clientState, possible security issue')
        return NextResponse.json({ error: 'Invalid clientState' }, { status: 403 })
      }
    } else {
      console.warn('⚠️ No clientState header or subscriptionId found')
    }

    // Idempotency: de-dupe by subscriptionId + changeToken + timestamp
    const changeKey = `${payload.subscriptionId}:${payload.changeType}:${payload.resource}:${payload.subscriptionExpirationDateTime || ''}`
    // Dedup check
    const { data: dedupHit } = await supabase
      .from('microsoft_webhook_dedup')
      .select('dedup_key')
      .eq('dedup_key', changeKey)
      .maybeSingle()
    if (dedupHit) {
      return NextResponse.json({ success: true, deduped: true })
    }
    await supabase.from('microsoft_webhook_dedup').insert({ dedup_key: changeKey })

    // Get subscription details to identify the user
    const { data: subscription } = await supabase
      .from('microsoft_graph_subscriptions')
      .select('user_id')
      .eq('id', payload.subscriptionId)
      .single()

    const userId = subscription?.user_id

    // Process the webhook data
    console.log('📊 Processing Microsoft Graph webhook:', {
      subscriptionId: payload.subscriptionId,
      changeType: payload.changeType,
      resource: payload.resource,
      clientState: clientState,
      userId: userId || 'unknown'
    })

    // Enqueue processing job
    await supabase.from('microsoft_webhook_queue').insert({
      user_id: userId,
      subscription_id: payload.subscriptionId,
      resource: payload.resource,
      change_type: payload.changeType,
      payload,
      headers,
      status: 'pending'
    })

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