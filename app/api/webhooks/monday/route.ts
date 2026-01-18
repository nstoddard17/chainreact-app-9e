import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'crypto'
import { logger } from '@/lib/utils/logger'
import { handleCorsPreFlight, addCorsHeaders } from '@/lib/utils/cors'

/**
 * Monday.com Webhook Handler
 * Receives real-time notifications from Monday.com for workflow triggers
 *
 * Webhook events:
 * - create_item (New Item Created trigger)
 * - change_column_value (Column Value Changed trigger)
 * - create_board (New Board trigger)
 * - move_item_to_group (Item Moved to Group trigger)
 * - create_subitem (New Subitem Created trigger)
 * - create_update (New Update Posted trigger)
 *
 * Security: Validates requests using HMAC signature
 * Docs: https://developer.monday.com/apps/docs/webhooks
 */

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

// Handle preflight CORS requests
export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request, {
    allowCredentials: true,
    allowedMethods: ['POST', 'OPTIONS'],
  })
}

/**
 * Verify Monday.com webhook signature
 * Uses HMAC SHA256 to validate request authenticity
 */
function verifySignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) {
    logger.warn('[Monday Webhook] No signature provided')
    return false
  }

  try {
    const hmac = createHmac('sha256', secret)
    hmac.update(payload)
    const expectedSignature = hmac.digest('hex')

    // Constant-time comparison to prevent timing attacks
    const bufferA = Buffer.from(signature)
    const bufferB = Buffer.from(expectedSignature)

    if (bufferA.length !== bufferB.length) {
      return false
    }

    return bufferA.equals(bufferB)
  } catch (error) {
    logger.error('[Monday Webhook] Signature verification error', { error })
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await request.text()

    // Get signature from headers
    const signature = request.headers.get('x-monday-signature')

    // Verify signature if signing secret is configured
    const signingSecret = process.env.MONDAY_SIGNING_SECRET
    if (signingSecret) {
      const isValid = verifySignature(rawBody, signature, signingSecret)
      if (!isValid) {
        logger.warn('[Monday Webhook] Invalid signature')
        const response = NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        )
        return addCorsHeaders(response, request, { allowCredentials: true })
      }
    } else {
      logger.warn('[Monday Webhook] No signing secret configured - signature verification skipped')
    }

    // Parse webhook payload
    const payload = JSON.parse(rawBody)
    const { event, challenge } = payload

    // Handle Monday.com challenge verification
    // When you first configure a webhook, Monday.com sends a challenge
    if (challenge) {
      logger.info('[Monday Webhook] Challenge received', { challenge })
      const response = NextResponse.json({ challenge })
      return addCorsHeaders(response, request, { allowCredentials: true })
    }

    // Log the webhook event
    logger.info('[Monday Webhook] Event received', {
      event: event?.type,
      boardId: event?.boardId,
      itemId: event?.itemId,
      userId: event?.userId,
    })

    const eventType = event?.type

    if (!eventType) {
      const response = NextResponse.json({ received: true, ignored: true })
      return addCorsHeaders(response, request, { allowCredentials: true })
    }

    // Extract workflow and node IDs from query params
    const { searchParams } = new URL(request.url)
    const workflowId = searchParams.get('workflowId')
    const nodeId = searchParams.get('nodeId')
    const testSessionId = searchParams.get('testSessionId')

    const triggerMapping: Record<string, string> = {
      'create_item': 'monday_trigger_new_item',
      'create_pulse': 'monday_trigger_new_item',
      'change_column_value': 'monday_trigger_column_changed',
      'update_column_value': 'monday_trigger_column_changed',
      'item_moved_to_any_group': 'monday_trigger_item_moved',
      'move_pulse_into_group': 'monday_trigger_item_moved',
      'create_subitem': 'monday_trigger_new_subitem',
      'create_update': 'monday_trigger_new_update'
    }

    const triggerType = triggerMapping[eventType]

    if (!triggerType) {
      logger.debug('[Monday Webhook] Ignoring event type', { eventType })
      const response = NextResponse.json({ received: true, ignored: true, eventType })
      return addCorsHeaders(response, request, { allowCredentials: true })
    }

    const transformedPayload = transformMondayPayload(eventType, event)

    if (testSessionId) {
      logger.info('[Monday Webhook] Storing test trigger result for session:', testSessionId)
      const { error: updateError } = await getSupabase()
        .from('workflow_test_sessions')
        .update({
          status: 'trigger_received',
          trigger_data: transformedPayload
        })
        .eq('id', testSessionId)

      if (updateError) {
        logger.error('[Monday Webhook] Failed to update test session:', { testSessionId, error: updateError.message })
      } else {
        logger.info('[Monday Webhook] Test trigger result stored successfully')
      }

      const response = NextResponse.json({ received: true, testSessionId })
      return addCorsHeaders(response, request, { allowCredentials: true })
    }

    const supabase = getSupabase()
    const eventIdBase = event?.eventId || event?.id || event?.itemId || event?.pulseId || event?.boardId || 'event'
    const webhookData = {
      provider: 'monday',
      event_type: eventType,
      event_id: `monday_${eventType}_${eventIdBase}_${Date.now()}`,
      payload: transformedPayload,
      received_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('webhook_events')
      .insert(webhookData)
      .select()
      .single()

    if (error) {
      logger.error('[Monday Webhook] Failed to store event:', error)
      const response = NextResponse.json({ error: 'Failed to store webhook' }, { status: 500 })
      return addCorsHeaders(response, request, { allowCredentials: true })
    }

    logger.debug('[Monday Webhook] Stored event', { id: data.id })

    await triggerWorkflowsForEvent(triggerType, transformedPayload, data.id, workflowId, nodeId)

    /**
     * Event processing will look like:
     *
     * 1. Identify the event type (event.type)
     * 2. Find all active workflows with matching trigger
     * 3. Verify the workflow's integration is still connected
     * 4. Extract relevant data from the event payload
     * 5. Queue workflow execution with the event data
     *
     * Example:
     * if (event.type === 'create_item') {
     *   await triggerWorkflows('monday_trigger_new_item', {
     *     itemId: event.itemId,
     *     boardId: event.boardId,
     *     itemName: event.itemName,
     *     // ... other fields
     *   })
     * }
     */

    const response = NextResponse.json({
      received: true,
      eventType: eventType,
    })

    return addCorsHeaders(response, request, { allowCredentials: true })
  } catch (error: any) {
    logger.error('[Monday Webhook] Error processing webhook', {
      error: error.message,
      stack: error.stack,
    })

    const response = NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )

    return addCorsHeaders(response, request, { allowCredentials: true })
  }
}

function transformMondayPayload(eventType: string, event: any): Record<string, any> {
  const baseData = {
    eventType,
    boardId: event?.boardId ?? event?.board_id,
    itemId: event?.itemId ?? event?.pulseId ?? event?.pulse_id,
    itemName: event?.itemName ?? event?.pulseName,
    userId: event?.userId ?? event?.user_id,
    timestamp: event?.triggerTime ?? event?.timestamp ?? new Date().toISOString(),
    rawEvent: event
  }

  if (eventType === 'change_column_value') {
    return {
      ...baseData,
      columnId: event?.columnId ?? event?.column_id,
      columnTitle: event?.columnTitle ?? event?.column_title,
      previousValue: event?.previousValue ?? event?.previous_value,
      newValue: event?.value ?? event?.newValue ?? event?.new_value,
      changedBy: event?.userId ?? event?.user_id,
      changedAt: event?.triggerTime ?? event?.timestamp ?? new Date().toISOString()
    }
  }

  return baseData
}

async function triggerWorkflowsForEvent(
  triggerType: string,
  payload: any,
  eventId: string,
  workflowId?: string | null,
  nodeId?: string | null
) {
  const supabase = getSupabase()

  try {
    if (workflowId && nodeId) {
      logger.debug(`[Monday Webhook] Triggering workflow ${workflowId}`)

      const { data: workflow } = await supabase
        .from('workflows')
        .select('*')
        .eq('id', workflowId)
        .eq('status', 'active')
        .single()

      if (!workflow) {
        logger.debug(`[Monday Webhook] Workflow ${workflowId} not found or inactive`)
        return
      }

      await supabase.from('workflow_executions').insert({
        workflow_id: workflowId,
        user_id: workflow.user_id,
        status: 'pending',
        trigger_data: payload,
        webhook_event_id: eventId,
        created_at: new Date().toISOString()
      })

      logger.debug(`[Monday Webhook] Queued execution for workflow ${workflowId}`)
      return
    }

    const { data: workflows } = await supabase
      .from('workflows')
      .select('*')
      .eq('status', 'active')
      .contains('nodes', [{ type: triggerType }])

    logger.debug(`[Monday Webhook] Found ${workflows?.length || 0} matching workflows`)

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
      logger.debug(`[Monday Webhook] Queued ${executions.length} executions`)
    }
  } catch (error: any) {
    logger.error('[Monday Webhook] Failed to trigger workflows:', error)
  }
}
