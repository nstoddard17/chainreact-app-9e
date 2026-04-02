/**
 * HubSpot Webhook Receiver
 *
 * Receives webhook notifications from HubSpot when CRM objects are created, updated, or deleted.
 * Routes notifications to the appropriate workflow executions.
 *
 * HubSpot Webhook Documentation: https://developers.hubspot.com/docs/api/webhooks
 */

import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { logger } from '@/lib/utils/logger'
import { executeWebhookWorkflow } from '@/lib/webhooks/execute'
import {
  buildHubSpotTriggerData,
  shouldSkipByConfig,
  logUnsupportedEvent,
  logWebhookSample
} from '@/lib/webhooks/hubspotWebhookUtils'

// Map HubSpot subscription types to our trigger types
const SUBSCRIPTION_TO_TRIGGER_MAP: Record<string, string> = {
  'contact.creation': 'hubspot_trigger_contact_created',
  'contact.propertyChange': 'hubspot_trigger_contact_updated',
  'contact.deletion': 'hubspot_trigger_contact_deleted',
  'company.creation': 'hubspot_trigger_company_created',
  'company.propertyChange': 'hubspot_trigger_company_updated',
  'company.deletion': 'hubspot_trigger_company_deleted',
  'deal.creation': 'hubspot_trigger_deal_created',
  'deal.propertyChange': 'hubspot_trigger_deal_updated',
  'deal.deletion': 'hubspot_trigger_deal_deleted',
  'ticket.creation': 'hubspot_trigger_ticket_created',
  'ticket.propertyChange': 'hubspot_trigger_ticket_updated',
  'ticket.deletion': 'hubspot_trigger_ticket_deleted',
  'note.creation': 'hubspot_trigger_note_created',
  'task.creation': 'hubspot_trigger_task_created',
  'call.creation': 'hubspot_trigger_call_created',
  'meeting.creation': 'hubspot_trigger_meeting_created',
  'form.submission': 'hubspot_trigger_form_submission',
}

/**
 * POST handler - receives webhook notifications from HubSpot
 */
export async function POST(req: NextRequest) {
  const testRunId = process.env.WEBHOOK_TEST_MODE === 'true'
    ? req.headers.get('x-test-run-id')
    : null
  const requestId = testRunId || crypto.randomUUID()

  logger.info('🔔 HubSpot webhook received at', new Date().toISOString())

  // Create client inside handler to avoid build-time initialization
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  try {
    const payload = await req.json()

    // Store webhook event for audit trail (canonical receipt contract)
    try {
      await supabase.from('webhook_events').insert({
        provider: 'hubspot',
        request_id: requestId,
        event_data: { ...payload, _meta: { originalRequestId: requestId } },
        status: 'received',
        timestamp: new Date().toISOString(),
      })
    } catch (e) {
      logger.warn('[HubSpot Webhook] Failed to store webhook event:', e)
    }

    logger.info('📦 HubSpot webhook payload:', {
      subscriptionType: payload.subscriptionType,
      objectId: payload.objectId,
      portalId: payload.portalId
    })

    // Extract subscription type from payload
    const subscriptionType = payload.subscriptionType
    const objectId = payload.objectId
    const portalId = payload.portalId

    if (!subscriptionType || !objectId) {
      logger.error('❌ Missing required fields in HubSpot webhook')
      return errorResponse('Missing required fields', 400)
    }

    // Map subscription type to trigger type
    const triggerType = SUBSCRIPTION_TO_TRIGGER_MAP[subscriptionType]
    if (!triggerType) {
      await logUnsupportedEvent(subscriptionType, payload)
      return jsonResponse({ success: true, message: 'Unknown subscription type' })
    }

    // Get workflow ID from query params (for Public App per-workflow webhooks)
    const workflowId = req.nextUrl.searchParams.get('workflowId')

    // Find matching workflows with this HubSpot trigger type
    // NOTE: Public Apps can create per-workflow webhooks with workflowId in URL.
    // If workflowId is provided, we only execute that specific workflow.
    // If not provided (legacy/global webhook), execute all matching workflows.
    let query = supabase
      .from('trigger_resources')
      .select('workflow_id, user_id, config')
      .eq('provider_id', 'hubspot')
      .eq('trigger_type', triggerType)
      .eq('status', 'active')

    // Filter by workflow ID if provided in query params
    if (workflowId) {
      query = query.eq('workflow_id', workflowId)
    }

    const { data: triggerResources } = await query

    if (!triggerResources || triggerResources.length === 0) {
      logger.info(`ℹ️ No active workflows found for trigger type: ${triggerType}`)
      return jsonResponse({ success: true, processed: 0 })
    }

    logger.info(`📋 Found ${triggerResources.length} workflow(s) to execute`)

    // Build trigger data from HubSpot payload
    const triggerData = buildHubSpotTriggerData(payload, subscriptionType)
    logWebhookSample(subscriptionType, payload)

    // Execute each matching workflow
    let executed = 0
    for (const resource of triggerResources) {
      // Filter by property name if specified in trigger config
      // This allows workflows to listen for changes to specific properties
      const propertyName = resource.config?.propertyName
      if (propertyName && payload.propertyName !== propertyName) {
        logger.info(`⏭️ Skipping workflow ${resource.workflow_id} - property filter mismatch`)
        continue
      }

      const skipReason = shouldSkipByConfig(triggerType, resource.config || {}, triggerData)
      if (skipReason) {
        logger.info(`⏭️ Skipping workflow ${resource.workflow_id} - ${skipReason}`)
        continue
      }

      logger.info(`⚡ Executing workflow ${resource.workflow_id}`)
      const execResult = await executeWebhookWorkflow({
        workflowId: resource.workflow_id,
        userId: resource.user_id,
        provider: 'hubspot',
        triggerType,
        triggerData,
        metadata: { subscriptionType: payload.subscriptionType, objectId: payload.objectId, requestId },
      })
      if (execResult.success) executed++
    }

    logger.info(`✅ Executed ${executed} workflow(s)`)
    return jsonResponse({ success: true, processed: executed })

  } catch (error: any) {
    logger.error('❌ HubSpot webhook error:', {
      message: error.message,
      stack: error.stack
    })
    return errorResponse(error.message || 'Failed to process webhook', 500)
  }
}

// Workflow execution is now handled by the shared executeWebhookWorkflow() helper

/**
 * GET handler - returns endpoint info
 */
export async function GET() {
  return jsonResponse({
    message: 'HubSpot webhook endpoint',
    provider: 'hubspot',
    supportedEvents: Object.keys(SUBSCRIPTION_TO_TRIGGER_MAP),
    documentation: 'https://developers.hubspot.com/docs/api/webhooks'
  })
}
