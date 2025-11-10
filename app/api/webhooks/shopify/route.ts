import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AdvancedExecutionEngine } from '@/lib/execution/advancedExecutionEngine'
import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Shopify Webhook Receiver
 *
 * Handles incoming webhooks from Shopify and triggers workflows
 *
 * Webhook Topics Supported:
 * - orders/create → shopify_trigger_new_order
 * - orders/paid → shopify_trigger_new_paid_order
 * - orders/fulfilled → shopify_trigger_order_fulfilled
 * - checkouts/create → shopify_trigger_abandoned_cart
 * - orders/updated → shopify_trigger_order_updated
 * - customers/create → shopify_trigger_new_customer
 * - products/update → shopify_trigger_product_updated
 * - inventory_levels/update → shopify_trigger_inventory_low
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const requestId = `shopify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  try {
    // Get raw body and headers
    const body = await request.text()
    const headers = Object.fromEntries(request.headers.entries())

    // Shopify-specific headers
    const shopifyTopic = headers['x-shopify-topic']
    const shopifyDomain = headers['x-shopify-shop-domain']
    const shopifyHmac = headers['x-shopify-hmac-sha256']

    logger.debug('[Shopify Webhook] Received webhook:', {
      requestId,
      topic: shopifyTopic,
      domain: shopifyDomain,
      hasHmac: !!shopifyHmac,
    })

    if (!shopifyTopic) {
      logger.warn('[Shopify Webhook] Missing X-Shopify-Topic header')
      return NextResponse.json({ error: 'Missing topic header' }, { status: 400 })
    }

    // Parse payload
    let payload: any
    try {
      payload = JSON.parse(body)
    } catch (error) {
      logger.error('[Shopify Webhook] Failed to parse JSON body:', error)
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    // TODO: Verify HMAC signature for security
    // For now, we'll trust the webhook (Shopify recommends verifying in production)

    // Map Shopify topic to trigger type
    const triggerTypeMap: Record<string, string> = {
      'orders/create': 'shopify_trigger_new_order',
      'orders/paid': 'shopify_trigger_new_paid_order',
      'orders/fulfilled': 'shopify_trigger_order_fulfilled',
      'checkouts/create': 'shopify_trigger_abandoned_cart',
      'orders/updated': 'shopify_trigger_order_updated',
      'customers/create': 'shopify_trigger_new_customer',
      'products/update': 'shopify_trigger_product_updated',
      'inventory_levels/update': 'shopify_trigger_inventory_low',
    }

    const triggerType = triggerTypeMap[shopifyTopic]

    if (!triggerType) {
      logger.warn('[Shopify Webhook] Unknown topic:', shopifyTopic)
      return NextResponse.json({ success: true, message: 'Topic not handled' })
    }

    logger.debug('[Shopify Webhook] Mapped topic to trigger:', {
      topic: shopifyTopic,
      triggerType,
    })

    // Fetch active workflows with this trigger type
    const { data: workflows, error: workflowError } = await supabase
      .from('workflows')
      .select('*')
      .eq('status', 'active')

    if (workflowError) {
      logger.error('[Shopify Webhook] Error fetching workflows:', workflowError)
      throw new Error('Failed to fetch workflows')
    }

    if (!workflows || workflows.length === 0) {
      logger.debug('[Shopify Webhook] No active workflows found')
      return NextResponse.json({ success: true, message: 'No active workflows' })
    }

    // Filter workflows that match this trigger type
    const matchingWorkflows = workflows.filter((wf) => {
      const nodes = Array.isArray(wf.nodes) ? wf.nodes : []
      const triggerNode = nodes.find((n: any) => n.data?.type === triggerType)
      return !!triggerNode
    })

    if (matchingWorkflows.length === 0) {
      logger.debug('[Shopify Webhook] No workflows match trigger type:', triggerType)
      return NextResponse.json({ success: true, message: 'No matching workflows' })
    }

    logger.info('[Shopify Webhook] Found matching workflows:', {
      count: matchingWorkflows.length,
      workflowIds: matchingWorkflows.map((w) => w.id),
    })

    // Transform Shopify payload to workflow trigger output
    const triggerOutput = transformShopifyPayload(shopifyTopic, payload)

    // Execute each matching workflow
    const results = []
    for (const workflow of matchingWorkflows) {
      // Check trigger config filters (e.g., minimum_value for abandoned carts)
      const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : []
      const triggerNode = nodes.find((n: any) => n.data?.type === triggerType)
      const triggerConfig = triggerNode?.data?.config || workflow.trigger_config || {}

      // Apply filters based on trigger type
      if (!shouldProcessWebhook(triggerType, triggerConfig, triggerOutput)) {
        logger.debug('[Shopify Webhook] Skipping workflow due to filter:', {
          workflowId: workflow.id,
          triggerType,
          config: triggerConfig,
        })
        continue
      }

      try {
        logger.info('[Shopify Webhook] Executing workflow:', {
          workflowId: workflow.id,
          userId: workflow.user_id,
        })

        const engine = new AdvancedExecutionEngine()
        const result = await engine.executeWorkflow(workflow, triggerOutput)

        results.push({
          workflowId: workflow.id,
          success: result.success,
          executionId: result.sessionId,
        })

        logger.info('[Shopify Webhook] Workflow executed:', {
          workflowId: workflow.id,
          success: result.success,
          executionId: result.sessionId,
        })
      } catch (error: any) {
        logger.error('[Shopify Webhook] Workflow execution error:', {
          workflowId: workflow.id,
          error: error.message,
        })

        results.push({
          workflowId: workflow.id,
          success: false,
          error: error.message,
        })
      }
    }

    const duration = Date.now() - startTime
    logger.info('[Shopify Webhook] Processing complete:', {
      requestId,
      topic: shopifyTopic,
      workflowsExecuted: results.length,
      duration: `${duration}ms`,
    })

    return NextResponse.json({
      success: true,
      workflowsExecuted: results.length,
      results,
    })
  } catch (error: any) {
    const duration = Date.now() - startTime
    logger.error('[Shopify Webhook] Error processing webhook:', {
      requestId,
      error: error.message,
      duration: `${duration}ms`,
    })

    // Still return 200 to Shopify to prevent retries
    return NextResponse.json({
      success: false,
      error: error.message,
    })
  }
}

/**
 * Transform Shopify webhook payload to workflow trigger output schema
 */
function transformShopifyPayload(topic: string, payload: any): any {
  switch (topic) {
    case 'orders/create':
    case 'orders/paid':
    case 'orders/updated':
    case 'orders/fulfilled':
      return {
        order_id: payload.id?.toString() || payload.admin_graphql_api_id,
        order_number: payload.order_number,
        customer_email: payload.email || payload.customer?.email,
        customer_name: payload.customer?.first_name
          ? `${payload.customer.first_name} ${payload.customer.last_name || ''}`.trim()
          : payload.customer?.name,
        total_price: parseFloat(payload.total_price || payload.current_total_price || '0'),
        currency: payload.currency || payload.presentment_currency,
        fulfillment_status: payload.fulfillment_status || null,
        financial_status: payload.financial_status,
        line_items: payload.line_items || [],
        shipping_address: payload.shipping_address,
        billing_address: payload.billing_address,
        created_at: payload.created_at,
        updated_at: payload.updated_at,
        // Fulfillment-specific fields
        tracking_number: payload.fulfillments?.[0]?.tracking_number,
        tracking_url: payload.fulfillments?.[0]?.tracking_url,
        fulfilled_at: payload.fulfillments?.[0]?.created_at,
      }

    case 'checkouts/create':
      return {
        checkout_id: payload.id?.toString() || payload.token,
        cart_token: payload.cart_token,
        customer_email: payload.email,
        customer_name: payload.customer?.first_name
          ? `${payload.customer.first_name} ${payload.customer.last_name || ''}`.trim()
          : null,
        total_price: parseFloat(payload.total_price || '0'),
        currency: payload.currency || payload.presentment_currency,
        line_items: payload.line_items || [],
        abandoned_checkout_url: payload.abandoned_checkout_url,
        created_at: payload.created_at,
        updated_at: payload.updated_at,
      }

    case 'customers/create':
      return {
        customer_id: payload.id?.toString() || payload.admin_graphql_api_id,
        email: payload.email,
        first_name: payload.first_name,
        last_name: payload.last_name,
        phone: payload.phone,
        accepts_marketing: payload.accepts_marketing,
        tags: payload.tags,
        total_spent: parseFloat(payload.total_spent || '0'),
        orders_count: payload.orders_count || 0,
        created_at: payload.created_at,
      }

    case 'products/update':
      return {
        product_id: payload.id?.toString() || payload.admin_graphql_api_id,
        title: payload.title,
        body_html: payload.body_html,
        vendor: payload.vendor,
        product_type: payload.product_type,
        tags: payload.tags,
        published: payload.published_at !== null,
        variants: payload.variants || [],
        created_at: payload.created_at,
        updated_at: payload.updated_at,
      }

    case 'inventory_levels/update':
      return {
        inventory_item_id: payload.inventory_item_id?.toString(),
        location_id: payload.location_id?.toString(),
        available: payload.available,
        updated_at: payload.updated_at,
      }

    default:
      return payload
  }
}

/**
 * Check if webhook should process based on trigger config filters
 */
function shouldProcessWebhook(triggerType: string, config: any, output: any): boolean {
  switch (triggerType) {
    case 'shopify_trigger_new_paid_order':
      // Filter by fulfillment status if specified
      if (config.fulfillment_status && config.fulfillment_status !== 'any') {
        const status = output.fulfillment_status
        if (config.fulfillment_status === 'fulfilled' && status !== 'fulfilled') return false
        if (config.fulfillment_status === 'unfulfilled' && status !== null && status !== 'unfulfilled') return false
        if (config.fulfillment_status === 'partial' && status !== 'partial') return false
      }
      break

    case 'shopify_trigger_abandoned_cart':
      // Filter by minimum cart value if specified
      if (config.minimum_value) {
        const minValue = parseFloat(config.minimum_value)
        if (output.total_price < minValue) {
          logger.debug('[Shopify Webhook] Cart below minimum value:', {
            cartValue: output.total_price,
            minimumValue: minValue,
          })
          return false
        }
      }
      break
  }

  return true
}
