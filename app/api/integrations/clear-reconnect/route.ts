import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { clearIntegrationWorkflowFlags } from '@/lib/integrations/integrationWorkflowManager'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseRouteHandlerClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return errorResponse('Unauthorized' , 401)
  }

  let body: { integrationId?: string } = {}

  try {
    body = await request.json()
  } catch {
    return errorResponse('Invalid request body' , 400)
  }

  const integrationId = body.integrationId

  if (!integrationId) {
    return errorResponse('integrationId is required' , 400)
  }

  const { data: integration, error: integrationError } = await supabase
    .from('integrations')
    .select('id, user_id, provider')
    .eq('id', integrationId)
    .single()

  if (integrationError || !integration || integration.user_id !== user.id) {
    return errorResponse('Integration not found' , 404)
  }

  const result = await clearIntegrationWorkflowFlags({
    integrationId: integration.id,
    provider: integration.provider,
    userId: integration.user_id,
  })

  return jsonResponse({ success: true, ...result })
}

