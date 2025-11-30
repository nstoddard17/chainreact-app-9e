import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { errorResponse, jsonResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

/**
 * Check the webhook verification status for a Notion trigger
 * Used by the webhook setup modal to provide real-time feedback
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workflowId = searchParams.get('workflowId')
    const nodeId = searchParams.get('nodeId')

    if (!workflowId || !nodeId) {
      return errorResponse('Missing workflowId or nodeId', 400)
    }

    const supabase = getSupabase()

    // Get the trigger resource
    const { data: resource, error } = await supabase
      .from('trigger_resources')
      .select('status, metadata')
      .eq('workflow_id', workflowId)
      .eq('node_id', nodeId)
      .eq('provider_id', 'notion')
      .single()

    if (error) {
      logger.error('[Notion Webhook Status] Failed to get trigger resource:', error)
      return errorResponse('Failed to get webhook status', 500)
    }

    if (!resource) {
      return errorResponse('Webhook not found', 404)
    }

    const webhookVerified = resource.metadata?.webhookVerified || false
    const lastWebhookReceived = resource.metadata?.lastWebhookReceived
    const verificationReceivedAt = resource.metadata?.verificationReceivedAt

    return jsonResponse({
      status: resource.status,
      webhookVerified,
      lastWebhookReceived,
      verificationReceivedAt,
      setupInstructions: resource.metadata?.setupInstructions,
      webhookUrl: resource.metadata?.webhookUrl
    })
  } catch (error) {
    logger.error('[Notion Webhook Status] Error:', error)
    return errorResponse('Internal server error', 500)
  }
}
