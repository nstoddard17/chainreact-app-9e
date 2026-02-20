import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { logger } from '@/lib/utils/logger'
import { handleCorsPreFlight, addCorsHeaders } from '@/lib/utils/cors'

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

// Map Shopify topic to trigger type
const TOPIC_TO_TRIGGER_MAP: Record<string, string> = {
  'orders/create': 'shopify_trigger_new_order',
  'orders/paid': 'shopify_trigger_new_paid_order',
  'orders/fulfilled': 'shopify_trigger_order_fulfilled',
  'checkouts/create': 'shopify_trigger_abandoned_cart',
  'orders/updated': 'shopify_trigger_order_updated',
  'customers/create': 'shopify_trigger_new_customer',
  'products/update': 'shopify_trigger_product_updated',
  'inventory_levels/update': 'shopify_trigger_inventory_low',
}

/**
 * Shopify Webhook Receiver
 *
 * Handles incoming webhooks from Shopify and triggers workflows.
 * Uses trigger_resources table for efficient workflow matching.
 * Verifies HMAC signature for production security.
 */

// Handle preflight CORS requests
export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request, {
    allowCredentials: true,
    allowedMethods: ['POST', 'OPTIONS'],
  })
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const requestId = `shopify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  try {
    // Get raw body for HMAC verification (must be read before parsing)
    const body = await request.text()

    // Shopify-specific headers
    const shopifyTopic = request.headers.get('x-shopify-topic')
    const shopifyDomain = request.headers.get('x-shopify-shop-domain')
    const shopifyHmac = request.headers.get('x-shopify-hmac-sha256')

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

    // Verify HMAC signature
    if (!verifyShopifyHmac(body, shopifyHmac)) {
      logger.warn('[Shopify Webhook] HMAC verification failed', { requestId })
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Parse payload
    let payload: any
    try {
      payload = JSON.parse(body)
    } catch (error) {
      logger.error('[Shopify Webhook] Failed to parse JSON body:', error)
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    // Map topic to trigger type
    const triggerType = TOPIC_TO_TRIGGER_MAP[shopifyTopic]
    if (!triggerType) {
      logger.warn('[Shopify Webhook] Unknown topic:', shopifyTopic)
      return NextResponse.json({ success: true, message: 'Topic not handled' })
    }

    logger.debug('[Shopify Webhook] Mapped topic to trigger:', {
      topic: shopifyTopic,
      triggerType,
    })

    // Get workflowId from query params (set during webhook creation in onActivate)
    const workflowId = request.nextUrl.searchParams.get('workflowId')

    // Query trigger_resources for matching active triggers
    const supabase = getSupabase()
    let query = supabase
      .from('trigger_resources')
      .select('workflow_id, user_id, config, trigger_type')
      .eq('provider_id', 'shopify')
      .eq('trigger_type', triggerType)
      .eq('status', 'active')

    if (workflowId) {
      query = query.eq('workflow_id', workflowId)
    }

    const { data: triggerResources, error: queryError } = await query

    if (queryError) {
      logger.error('[Shopify Webhook] Error fetching trigger resources:', queryError)
      return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 })
    }

    if (!triggerResources || triggerResources.length === 0) {
      logger.debug('[Shopify Webhook] No active trigger resources found', {
        triggerType,
        workflowId,
      })
      return NextResponse.json({ success: true, message: 'No matching workflows' })
    }

    logger.info('[Shopify Webhook] Found matching trigger resources:', {
      count: triggerResources.length,
      workflowIds: triggerResources.map((r) => r.workflow_id),
    })

    // Transform Shopify payload to workflow trigger output
    const triggerOutput = transformShopifyPayload(shopifyTopic, payload)

    // Execute each matching workflow
    let executed = 0
    for (const resource of triggerResources) {
      // Apply trigger config filters
      if (!shouldProcessWebhook(resource.trigger_type, resource.config || {}, triggerOutput)) {
        logger.debug('[Shopify Webhook] Skipping workflow due to filter:', {
          workflowId: resource.workflow_id,
          triggerType: resource.trigger_type,
        })
        continue
      }

      logger.info('[Shopify Webhook] Executing workflow:', {
        workflowId: resource.workflow_id,
        userId: resource.user_id,
      })

      await executeWorkflow(resource.workflow_id, resource.user_id, triggerOutput)
      executed++
    }

    const duration = Date.now() - startTime
    logger.info('[Shopify Webhook] Processing complete:', {
      requestId,
      topic: shopifyTopic,
      workflowsExecuted: executed,
      duration: `${duration}ms`,
    })

    return NextResponse.json({
      success: true,
      workflowsExecuted: executed,
    })
  } catch (error: any) {
    const duration = Date.now() - startTime
    logger.error('[Shopify Webhook] Error processing webhook:', {
      requestId,
      error: error.message,
      duration: `${duration}ms`,
    })

    // Return 200 to Shopify to prevent retries
    return NextResponse.json({
      success: false,
      error: error.message,
    })
  }
}

/**
 * Verify Shopify HMAC signature
 * Uses base64-encoded HMAC-SHA256 with the Shopify client secret
 */
function verifyShopifyHmac(rawBody: string, hmacHeader: string | null): boolean {
  const secret = process.env.SHOPIFY_CLIENT_SECRET
  if (!secret) {
    logger.warn('[Shopify Webhook] SHOPIFY_CLIENT_SECRET not configured - skipping HMAC verification')
    return true
  }

  if (!hmacHeader) {
    logger.warn('[Shopify Webhook] No HMAC header provided')
    return false
  }

  try {
    const hmac = crypto.createHmac('sha256', secret)
    hmac.update(rawBody, 'utf-8')
    const expectedHmac = hmac.digest('base64')

    const bufferA = Buffer.from(hmacHeader)
    const bufferB = Buffer.from(expectedHmac)

    if (bufferA.length !== bufferB.length) {
      return false
    }

    return crypto.timingSafeEqual(bufferA, bufferB)
  } catch (error) {
    logger.error('[Shopify Webhook] HMAC verification error:', error)
    return false
  }
}

/**
 * Execute a workflow with trigger data
 * Follows the same pattern as Gumroad/HubSpot webhook handlers
 */
async function executeWorkflow(workflowId: string, userId: string, triggerData: any): Promise<void> {
  try {
    const supabase = getSupabase()

    // Load workflow, nodes, and edges with service-role client (bypasses RLS)
    // Webhook context has no cookies, so cookie-based clients can't read nodes
    const [workflowResult, nodesResult, edgesResult] = await Promise.all([
      supabase.from('workflows').select('*').eq('id', workflowId).eq('status', 'active').single(),
      supabase.from('workflow_nodes').select('*').eq('workflow_id', workflowId).order('display_order'),
      supabase.from('workflow_edges').select('*').eq('workflow_id', workflowId),
    ])

    if (workflowResult.error || !workflowResult.data) {
      logger.error(`[Shopify Webhook] Workflow ${workflowId} not found or inactive`)
      return
    }

    const workflow = workflowResult.data

    // Map to the format WorkflowExecutionService expects
    const nodes = (nodesResult.data || []).map((n: any) => ({
      id: n.id,
      type: n.node_type,
      position: { x: n.position_x, y: n.position_y },
      data: {
        type: n.node_type,
        label: n.label,
        config: n.config || {},
        isTrigger: n.is_trigger,
        providerId: n.provider_id,
      },
    }))

    const edges = (edgesResult.data || []).map((e: any) => ({
      id: e.id,
      source: e.source_node_id,
      target: e.target_node_id,
      sourceHandle: e.source_port_id || 'source',
      targetHandle: e.target_port_id || 'target',
    }))

    logger.debug(`[Shopify Webhook] Loaded ${nodes.length} nodes and ${edges.length} edges for workflow ${workflowId}`)

    const { WorkflowExecutionService } = await import('@/lib/services/workflowExecutionService')
    const workflowExecutionService = new WorkflowExecutionService()

    const executionResult = await workflowExecutionService.executeWorkflow(
      workflow,
      triggerData,
      userId,
      false,            // testMode
      { nodes, edges }, // workflowData - pass nodes/edges directly to bypass RLS
      true              // skipTriggers (already triggered by webhook)
    )

    logger.info('[Shopify Webhook] Workflow executed:', {
      workflowId,
      success: !!executionResult.results,
      executionId: executionResult.executionId,
    })
  } catch (error: any) {
    logger.error(`[Shopify Webhook] Failed to execute workflow ${workflowId}:`, {
      message: error.message,
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
        tags: payload.tags,
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
        status: payload.status || (payload.published_at !== null ? 'active' : 'draft'),
        variants: payload.variants || [],
        created_at: payload.created_at,
        updated_at: payload.updated_at,
      }

    case 'inventory_levels/update':
      return {
        inventory_item_id: payload.inventory_item_id?.toString(),
        location_id: payload.location_id?.toString(),
        quantity: payload.available,
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
    case 'shopify_trigger_new_order':
      // Filter by fulfillment status if specified
      if (config.fulfillment_status && config.fulfillment_status !== 'any') {
        const status = output.fulfillment_status
        if (config.fulfillment_status === 'fulfilled' && status !== 'fulfilled') return false
        if (config.fulfillment_status === 'unfulfilled' && status !== null && status !== 'unfulfilled') return false
        if (config.fulfillment_status === 'partial' && status !== 'partial') return false
      }
      // Filter by financial status if specified
      if (config.financial_status && config.financial_status !== 'any') {
        if (output.financial_status !== config.financial_status) return false
      }
      break

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

    case 'shopify_trigger_inventory_low':
      // Filter by threshold - only trigger when inventory falls below threshold
      if (config.threshold) {
        const threshold = parseInt(config.threshold)
        if (!isNaN(threshold) && output.quantity >= threshold) {
          logger.debug('[Shopify Webhook] Inventory not below threshold:', {
            quantity: output.quantity,
            threshold,
          })
          return false
        }
      }
      // Filter by location if specified
      if (config.location_id && output.location_id !== config.location_id) {
        logger.debug('[Shopify Webhook] Location mismatch:', {
          expected: config.location_id,
          received: output.location_id,
        })
        return false
      }
      break

    // shopify_trigger_order_updated: Shopify sends full order state, not diffs.
    // watch_field filtering would require snapshot-based comparison - allow all for now.

    // shopify_trigger_product_updated: collection_id check would require extra API call.
    // Allow all product updates for now.
  }

  return true
}
