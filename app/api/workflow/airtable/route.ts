import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateAirtableSignature } from '@/lib/integrations/airtable/webhooks'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const headers = Object.fromEntries(req.headers.entries())

  try {
    const payload = JSON.parse(raw)
    // Identify baseId and user via stored webhook
    const baseId = payload?.base?.id || payload?.baseId
    if (!baseId) return NextResponse.json({ error: 'Missing base id' }, { status: 400 })

    // Find webhook secret for this base
    const { data: wh } = await supabase
      .from('airtable_webhooks')
      .select('id,user_id,mac_secret_base64,status')
      .eq('base_id', baseId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    if (!wh) return NextResponse.json({ error: 'Webhook not registered' }, { status: 404 })

    // Verify signature
    const valid = validateAirtableSignature(raw, headers, wh.mac_secret_base64)
    if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

    // Hand off to unified provider endpoint processing
    // Reuse same code path by inserting an execution log and enqueueing the workflow run via integration-webhooks
    const { data: exec } = await supabase
      .from('integration_webhook_executions')
      .insert({
        webhook_id: wh.id,
        user_id: wh.user_id,
        provider_id: 'airtable',
        trigger_type: 'airtable_trigger_event',
        payload: payload,
        headers: headers,
        status: 'pending'
      })
      .select()
      .single()

    // Simple success response; workflows will be executed via existing integration flow if needed elsewhere
    return NextResponse.json({ success: true, executionId: exec?.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Invalid payload' }, { status: 400 })
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Airtable webhook endpoint',
    provider: 'airtable',
    verification: 'Requires X-Airtable-Signature-256 HMAC-SHA256 of raw body using macSecretBase64'
  })
}


