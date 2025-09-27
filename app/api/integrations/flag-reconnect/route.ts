import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { flagIntegrationWorkflows } from '@/lib/integrations/integrationWorkflowManager'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseRouteHandlerClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { integrationId?: string; provider?: string; reason?: string } = {}

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const integrationId = body.integrationId
  const reason = body.reason

  if (!integrationId) {
    return NextResponse.json({ error: 'integrationId is required' }, { status: 400 })
  }

  const { data: integration, error: integrationError } = await supabase
    .from('integrations')
    .select('id, user_id, provider')
    .eq('id', integrationId)
    .single()

  if (integrationError || !integration || integration.user_id !== user.id) {
    return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
  }

  const result = await flagIntegrationWorkflows({
    integrationId: integration.id,
    provider: integration.provider,
    userId: integration.user_id,
    reason,
  })

  return NextResponse.json({ success: true, ...result })
}
