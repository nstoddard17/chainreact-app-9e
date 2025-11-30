import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'

/**
 * Mailchimp Webhook Endpoint
 *
 * Handles webhook events from Mailchimp for workflow triggers.
 * Supports: subscribe, unsubscribe, profile updates, email changes, campaigns
 *
 * Event types:
 * - subscribe: New subscriber added
 * - unsubscribe: Subscriber unsubscribed
 * - profile: Profile updated
 * - upemail: Email address changed
 * - cleaned: Email cleaned (bounced)
 * - campaign: Campaign sent
 */

// Helper to create supabase client
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export async function POST(request: NextRequest) {
  const supabase = getSupabase()

  try {
    logger.debug('[Mailchimp Webhook] Received webhook event')

    // Mailchimp sends data as form-encoded
    const formData = await request.formData()
    const eventType = formData.get('type') as string

    logger.debug(`[Mailchimp Webhook] Event type: ${eventType}`)

    // Extract workflow and node IDs from query params
    const { searchParams } = new URL(request.url)
    const workflowId = searchParams.get('workflowId')
    const nodeId = searchParams.get('nodeId')

    // Build payload from form data
    const payload: any = {}
    formData.forEach((value, key) => {
      payload[key] = value
    })

    logger.debug('[Mailchimp Webhook] Payload:', JSON.stringify(payload, null, 2))

    // Map Mailchimp event to trigger type
    const triggerMapping: Record<string, string> = {
      'subscribe': 'mailchimp_trigger_new_subscriber',
      'unsubscribe': 'mailchimp_trigger_unsubscribed',
      'profile': 'mailchimp_trigger_subscriber_updated',
      'upemail': 'mailchimp_trigger_subscriber_updated',
      'campaign': 'mailchimp_trigger_new_campaign'
    }

    const triggerType = triggerMapping[eventType]

    if (!triggerType) {
      logger.debug(`[Mailchimp Webhook] Ignoring event type: ${eventType}`)
      return jsonResponse({ received: true, ignored: true })
    }

    // Transform payload to standard format
    const transformedPayload = transformMailchimpPayload(eventType, payload)

    // Store webhook event
    const webhookData = {
      provider: 'mailchimp',
      event_type: eventType,
      event_id: `${eventType}_${payload.id || payload.list_id}_${Date.now()}`,
      payload: transformedPayload,
      received_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('webhook_events')
      .insert(webhookData)
      .select()
      .single()

    if (error) {
      logger.error('[Mailchimp Webhook] Failed to store event:', error)
      return errorResponse('Failed to store webhook', 500)
    }

    logger.debug(`[Mailchimp Webhook] Stored event: ${data.id}`)

    // Trigger workflows
    await triggerWorkflowsForEvent(triggerType, transformedPayload, data.id, workflowId, nodeId)

    return jsonResponse({ received: true, event_id: data.id })
  } catch (error: any) {
    logger.error('[Mailchimp Webhook] Handler error:', error)
    return errorResponse('Internal server error', 500)
  }
}

// Handle GET requests for webhook verification
export async function GET(request: NextRequest) {
  logger.debug('[Mailchimp Webhook] Received verification request')

  // Mailchimp doesn't use verification challenges like some providers
  // Just return 200 OK
  return new NextResponse('OK', { status: 200 })
}

/**
 * Transform Mailchimp webhook payload to standard format
 */
function transformMailchimpPayload(eventType: string, payload: any): any {
  const baseData = {
    email: payload['data[email]'] || payload.email,
    audienceId: payload['data[list_id]'] || payload.list_id,
    timestamp: new Date().toISOString()
  }

  switch (eventType) {
    case 'subscribe':
      return {
        ...baseData,
        firstName: payload['data[merges][FNAME]'],
        lastName: payload['data[merges][LNAME]'],
        status: 'subscribed',
        subscriberId: payload['data[id]'],
        source: payload['data[source]'] || 'webhook',
        ipAddress: payload['data[ip_opt]']
      }

    case 'unsubscribe':
      return {
        ...baseData,
        firstName: payload['data[merges][FNAME]'],
        lastName: payload['data[merges][LNAME]'],
        reason: payload['data[reason]'],
        campaignId: payload['data[campaign_id]'],
        subscriberId: payload['data[id]']
      }

    case 'profile':
    case 'upemail':
      return {
        ...baseData,
        firstName: payload['data[merges][FNAME]'],
        lastName: payload['data[merges][LNAME]'],
        status: payload['data[status]'],
        subscriberId: payload['data[id]'],
        eventType: eventType === 'upemail' ? 'email_changed' : 'profile_updated',
        oldEmail: payload['data[old_email]'],
        newEmail: payload['data[new_email]']
      }

    case 'campaign':
      return {
        campaignId: payload['data[id]'],
        title: payload['data[subject]'],
        subject: payload['data[subject]'],
        status: payload['data[status]'],
        sendTime: payload['data[send_time]'],
        ...baseData
      }

    default:
      return baseData
  }
}

/**
 * Trigger workflows that match this event
 */
async function triggerWorkflowsForEvent(
  triggerType: string,
  payload: any,
  eventId: string,
  workflowId?: string | null,
  nodeId?: string | null
) {
  const supabase = getSupabase()

  try {
    // If workflow ID provided, trigger that specific workflow
    if (workflowId && nodeId) {
      logger.debug(`[Mailchimp Webhook] Triggering workflow ${workflowId}`)

      // Check if workflow is active
      const { data: workflow } = await supabase
        .from('workflows')
        .select('*')
        .eq('id', workflowId)
        .eq('status', 'active')
        .single()

      if (!workflow) {
        logger.debug(`[Mailchimp Webhook] Workflow ${workflowId} not found or inactive`)
        return
      }

      // Queue workflow execution
      await supabase.from('workflow_executions').insert({
        workflow_id: workflowId,
        user_id: workflow.user_id,
        status: 'pending',
        trigger_data: payload,
        webhook_event_id: eventId,
        created_at: new Date().toISOString()
      })

      logger.debug(`✅ [Mailchimp Webhook] Queued execution for workflow ${workflowId}`)
    } else {
      // Find all matching workflows
      const { data: workflows } = await supabase
        .from('workflows')
        .select('*')
        .eq('status', 'active')
        .contains('nodes', [{ type: triggerType }])

      logger.debug(`[Mailchimp Webhook] Found ${workflows?.length || 0} matching workflows`)

      // Queue executions for each matching workflow
      if (workflows && workflows.length > 0) {
        const executions = workflows.map(workflow => ({
          workflow_id: workflow.id,
          user_id: workflow.user_id,
          status: 'pending',
          trigger_data: payload,
          webhook_event_id: eventId,
          created_at: new Date().toISOString()
        }))

        await supabase.from('workflow_executions').insert(executions)
        logger.debug(`✅ [Mailchimp Webhook] Queued ${executions.length} executions`)
      }
    }
  } catch (error: any) {
    logger.error('[Mailchimp Webhook] Failed to trigger workflows:', error)
  }
}
