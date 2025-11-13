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
import { logger } from '@/lib/utils/logger'
import {
  buildHubSpotTriggerData,
  shouldSkipByConfig,
  logUnsupportedEvent,
  logWebhookSample
} from '@/lib/webhooks/hubspotWebhookUtils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
  logger.debug('🔔 HubSpot webhook received at', new Date().toISOString())

  try {
    const payload = await req.json()

    logger.debug('📦 HubSpot webhook payload:', {
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
      logger.debug(`ℹ️ No active workflows found for trigger type: ${triggerType}`)
      return jsonResponse({ success: true, processed: 0 })
    }

    logger.debug(`📋 Found ${triggerResources.length} workflow(s) to execute`)

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
        logger.debug(`⏭️ Skipping workflow ${resource.workflow_id} - property filter mismatch`)
        continue
      }

      const skipReason = shouldSkipByConfig(triggerType, resource.config || {}, triggerData)
      if (skipReason) {
        logger.debug(`⏭️ Skipping workflow ${resource.workflow_id} - ${skipReason}`)
        continue
      }

      logger.debug(`⚡ Executing workflow ${resource.workflow_id}`)
      await executeWorkflow(resource.workflow_id, resource.user_id, triggerData)
      executed++
    }

    logger.debug(`✅ Executed ${executed} workflow(s)`)
    return jsonResponse({ success: true, processed: executed })

  } catch (error: any) {
    logger.error('❌ HubSpot webhook error:', {
      message: error.message,
      stack: error.stack
    })
    return errorResponse(error.message || 'Failed to process webhook', 500)
  }
}

/**
 * Execute workflow with trigger data
 */
async function executeWorkflow(workflowId: string, userId: string, triggerData: any): Promise<void> {
  try {
    logger.debug(`🚀 Executing workflow ${workflowId}`)

    // Get workflow details
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .eq('status', 'active')
      .single()

    if (workflowError || !workflow) {
      logger.error(`❌ Failed to get workflow ${workflowId}:`, workflowError)
      return
    }

    logger.debug(`⚡ Executing workflow "${workflow.name}"`)

    // Import workflow execution service
    const { WorkflowExecutionService } = await import('@/lib/services/workflowExecutionService')
    const workflowExecutionService = new WorkflowExecutionService()

    // Execute the workflow with trigger data as input
    const executionResult = await workflowExecutionService.executeWorkflow(
      workflow,
      triggerData, // Pass trigger data as input
      userId,
      false, // testMode = false (real trigger)
      null, // No workflow data override
      true // skipTriggers = true (already triggered by webhook)
    )

    logger.debug(`✅ Workflow execution completed:`, {
      success: !!executionResult.results,
      executionId: executionResult.executionId,
      resultsCount: executionResult.results?.length || 0
    })

  } catch (error: any) {
    logger.error(`❌ Failed to execute workflow ${workflowId}:`, {
      message: error.message,
      stack: error.stack
    })
  }
}

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
