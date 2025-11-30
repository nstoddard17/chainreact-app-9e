/**
 * Gumroad Webhook Receiver
 *
 * Receives webhook notifications from Gumroad ("Pings") when sales, subscriptions, or other events occur.
 * Routes notifications to the appropriate workflow executions.
 *
 * Gumroad Webhook Documentation: https://help.gumroad.com/article/308-webhooks
 * Gumroad Ping Settings: https://app.gumroad.com/settings/advanced#ping-settings
 *
 * NOTE: Gumroad webhooks must be manually configured in the Gumroad dashboard.
 * They send POST requests with form-encoded data, not JSON.
 */

import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

// Map Gumroad event types to our trigger types
// Gumroad sends different data for different events, but the event type is inferred from the payload
const EVENT_TO_TRIGGER_MAP: Record<string, string> = {
  'sale': 'gumroad_trigger_new_sale',
  'refund': 'gumroad_trigger_sale_refunded',
  'dispute': 'gumroad_trigger_dispute',
  'dispute_won': 'gumroad_trigger_dispute_won',
  'cancellation': 'gumroad_trigger_subscription_cancelled',
  'subscription_updated': 'gumroad_trigger_subscription_updated',
  'subscription_ended': 'gumroad_trigger_subscription_ended',
  'subscription_restarted': 'gumroad_trigger_subscription_restarted',
}

/**
 * POST handler - receives webhook notifications from Gumroad
 */
export async function POST(req: NextRequest) {
  logger.debug('🔔 Gumroad webhook received at', new Date().toISOString())

  try {
    // Gumroad sends form-encoded data, not JSON
    const formData = await req.formData()

    // Convert form data to object
    const payload: Record<string, any> = {}
    formData.forEach((value, key) => {
      payload[key] = value
    })

    logger.debug('📦 Gumroad webhook payload:', {
      id: payload.id,
      product_id: payload.product_id,
      email: payload.email,
      price: payload.price
    })

    // Determine event type from payload
    const eventType = determineEventType(payload)

    if (!eventType) {
      logger.warn('⚠️ Unable to determine Gumroad event type from payload')
      return jsonResponse({ success: true, message: 'Unknown event type' })
    }

    logger.debug(`📋 Event type determined: ${eventType}`)

    // Map event type to trigger type
    const triggerType = EVENT_TO_TRIGGER_MAP[eventType]
    if (!triggerType) {
      logger.warn(`⚠️ Unknown Gumroad event type: ${eventType}`)
      return jsonResponse({ success: true, message: 'Unknown event type' })
    }

    // Get workflow ID from query params (for per-workflow webhooks)
    const workflowId = req.nextUrl.searchParams.get('workflowId')

    // Find matching workflows with this Gumroad trigger type
    let query = supabase
      .from('trigger_resources')
      .select('workflow_id, user_id, config')
      .eq('provider_id', 'gumroad')
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

    // Build trigger data from Gumroad payload
    const triggerData = buildTriggerData(payload, eventType)

    // Execute each matching workflow
    let executed = 0
    for (const resource of triggerResources) {
      // Filter by product ID if specified in trigger config
      const productFilter = resource.config?.product
      if (productFilter && payload.product_id !== productFilter) {
        logger.debug(`⏭️ Skipping workflow ${resource.workflow_id} - product filter mismatch`)
        continue
      }

      // For subscription updated trigger, filter by update type if specified
      if (triggerType === 'gumroad_trigger_subscription_updated' && resource.config?.updateType) {
        const updateType = resource.config.updateType
        if (updateType !== 'all') {
          // Determine if this is an upgrade or downgrade
          const isUpgrade = payload.variant_name && payload.variant_name.includes('upgrade')
          const isDowngrade = payload.variant_name && payload.variant_name.includes('downgrade')

          if (updateType === 'upgrade' && !isUpgrade) {
            logger.debug(`⏭️ Skipping workflow ${resource.workflow_id} - not an upgrade`)
            continue
          }
          if (updateType === 'downgrade' && !isDowngrade) {
            logger.debug(`⏭️ Skipping workflow ${resource.workflow_id} - not a downgrade`)
            continue
          }
        }
      }

      logger.debug(`⚡ Executing workflow ${resource.workflow_id}`)
      await executeWorkflow(resource.workflow_id, resource.user_id, triggerData)
      executed++
    }

    logger.debug(`✅ Executed ${executed} workflow(s)`)
    return jsonResponse({ success: true, processed: executed })

  } catch (error: any) {
    logger.error('❌ Gumroad webhook error:', {
      message: error.message,
      stack: error.stack
    })
    return errorResponse(error.message || 'Failed to process webhook', 500)
  }
}

/**
 * Determine event type from Gumroad payload
 * Gumroad doesn't send an explicit event type, so we infer it from the payload
 */
function determineEventType(payload: Record<string, any>): string | null {
  // Refund event
  if (payload.refunded === 'true' || payload.refunded === true) {
    return 'refund'
  }

  // Dispute events
  if (payload.disputed === 'true' || payload.disputed === true) {
    return 'dispute'
  }
  if (payload.dispute_won === 'true' || payload.dispute_won === true) {
    return 'dispute_won'
  }

  // Subscription cancellation
  if (payload.cancelled === 'true' || payload.cancelled === true) {
    return 'cancellation'
  }

  // Subscription ended
  if (payload.ended === 'true' || payload.ended === true) {
    return 'subscription_ended'
  }

  // Subscription restarted
  if (payload.subscription_restarted === 'true' || payload.subscription_restarted === true) {
    return 'subscription_restarted'
  }

  // Subscription updated (plan change)
  if (payload.subscription_updated === 'true' || payload.subscription_updated === true) {
    return 'subscription_updated'
  }

  // New subscriber (has subscription_id but not a cancellation/refund)
  if (payload.subscription_id && !payload.cancelled && !payload.refunded) {
    // Check if this is a new subscription vs renewal
    if (payload.is_recurring_charge === 'false' || payload.is_recurring_charge === false) {
      return 'sale' // Treat as new subscriber
    }
  }

  // Regular sale (default case)
  if (payload.id && payload.product_id) {
    return 'sale'
  }

  return null
}

/**
 * Build trigger data from Gumroad webhook payload
 */
function buildTriggerData(payload: Record<string, any>, eventType: string): Record<string, any> {
  const baseData = {
    saleId: payload.id,
    productId: payload.product_id,
    productName: payload.product_name,
    permalink: payload.product_permalink,
    email: payload.email,
    price: parseInt(payload.price) || 0,
    currency: payload.currency || 'USD',
    quantity: parseInt(payload.quantity) || 1,
    saleTimestamp: payload.sale_timestamp || new Date().toISOString(),
    orderId: payload.order_id,
    eventType: eventType,
  }

  // Add purchaser details
  const purchaserData = {
    fullName: payload.full_name,
    purchaseEmail: payload.purchase_email || payload.email,
    ipCountry: payload.ip_country,
    variants: payload.variants,
    customFields: payload.custom_fields,
  }

  // Add subscription details if present
  const subscriptionData = payload.subscription_id ? {
    subscriptionId: payload.subscription_id,
    isSubscription: true,
    isRecurringCharge: payload.is_recurring_charge === 'true',
  } : {
    isSubscription: false
  }

  // Add status flags
  const statusData = {
    refunded: payload.refunded === 'true',
    partiallyRefunded: payload.partially_refunded === 'true',
    disputed: payload.disputed === 'true',
    disputeWon: payload.dispute_won === 'true',
    chargedback: payload.chargedback === 'true',
    cancelled: payload.cancelled === 'true',
    ended: payload.ended === 'true',
  }

  // Add license key if present
  const licenseData = payload.license_key ? {
    licenseKey: payload.license_key,
    uses: parseInt(payload.license_uses) || 0,
  } : {}

  // Combine all data
  return {
    ...baseData,
    ...purchaserData,
    ...subscriptionData,
    ...statusData,
    ...licenseData,
    rawPayload: payload, // Include full payload for advanced use cases
  }
}

/**
 * Execute workflow with trigger data
 */
async function executeWorkflow(workflowId: string, userId: string, triggerData: any): Promise<void> {
  try {
    logger.debug(`🚀 Executing workflow ${workflowId}`)

    // Get workflow details
    const { data: workflow, error: workflowError } = await getSupabase()
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
    message: 'Gumroad webhook endpoint',
    provider: 'gumroad',
    supportedEvents: Object.keys(EVENT_TO_TRIGGER_MAP),
    setupInstructions: 'Configure this webhook URL in Gumroad dashboard at https://app.gumroad.com/settings/advanced#ping-settings',
    documentation: 'https://help.gumroad.com/article/308-webhooks'
  })
}
