import { ActionResult } from '../index'
import { makeShopifyRequest, validateShopifyIntegration } from '@/app/api/integrations/shopify/data/utils'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { logger } from '@/lib/utils/logger'

/**
 * Extract numeric ID from Shopify GID format
 * Example: gid://shopify/Order/123456789 → 123456789
 */
function extractNumericId(id: string): string {
  if (id.includes('gid://')) {
    return id.split('/').pop() || id
  }
  return id
}

/**
 * Create Shopify Fulfillment
 * Creates a fulfillment for an order with optional tracking information
 *
 * NOTE: Modern Shopify API (2024-01) requires FulfillmentOrder pattern:
 * 1. Fetch FulfillmentOrders for the order
 * 2. Create Fulfillment with fulfillment_order_line_items
 *
 * This implementation follows the recommended approach.
 */
export async function createShopifyFulfillment(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // 1. Get and validate integration
    const integrationId = await resolveValue(config.integration_id || config.integrationId, input)
    const integration = await getDecryptedAccessToken(integrationId, userId, 'shopify')
    validateShopifyIntegration(integration)

    // 2. Resolve config values
    const orderId = await resolveValue(config.order_id, input)
    const trackingNumber = config.tracking_number ? await resolveValue(config.tracking_number, input) : undefined
    const trackingCompany = config.tracking_company ? await resolveValue(config.tracking_company, input) : undefined
    const trackingUrl = config.tracking_url ? await resolveValue(config.tracking_url, input) : undefined
    const notifyCustomer = config.notify_customer !== undefined
      ? await resolveValue(config.notify_customer, input) === 'true' || await resolveValue(config.notify_customer, input) === true
      : true // Default to true

    // 3. Extract numeric ID from GID if needed
    const numericOrderId = extractNumericId(orderId)

    logger.debug('[Shopify] Creating fulfillment for order:', { orderId: numericOrderId })

    // 4. Fetch FulfillmentOrders for this order (required by modern API)
    const fulfillmentOrdersResponse = await makeShopifyRequest(
      integration,
      `orders/${numericOrderId}/fulfillment_orders.json`
    )

    const fulfillmentOrders = fulfillmentOrdersResponse.fulfillment_orders

    if (!fulfillmentOrders || fulfillmentOrders.length === 0) {
      throw new Error('No fulfillment orders found for this order')
    }

    // 5. Use the first open/scheduled fulfillment order
    const fulfillmentOrder = fulfillmentOrders.find((fo: any) =>
      fo.status === 'open' || fo.status === 'scheduled'
    ) || fulfillmentOrders[0]

    // 6. Build fulfillment_order_line_items array (fulfill all line items)
    const lineItems = fulfillmentOrder.line_items.map((item: any) => ({
      id: item.id,
      quantity: item.fulfillable_quantity
    }))

    // 7. Build fulfillment payload
    const payload: any = {
      line_items_by_fulfillment_order: [
        {
          fulfillment_order_id: fulfillmentOrder.id,
          fulfillment_order_line_items: lineItems
        }
      ],
      notify_customer: notifyCustomer
    }

    // Add tracking information if provided
    if (trackingNumber || trackingCompany || trackingUrl) {
      payload.tracking_info = {}
      if (trackingNumber) payload.tracking_info.number = trackingNumber
      if (trackingCompany) payload.tracking_info.company = trackingCompany
      if (trackingUrl) payload.tracking_info.url = trackingUrl
    }

    logger.debug('[Shopify] Fulfillment payload:', payload)

    // 8. Create fulfillment
    const result = await makeShopifyRequest(integration, 'fulfillments.json', {
      method: 'POST',
      body: JSON.stringify({ fulfillment: payload })
    })

    const fulfillment = result.fulfillment

    return {
      success: true,
      output: {
        success: true,
        fulfillment_id: fulfillment.id,
        order_id: numericOrderId,
        tracking_number: fulfillment.tracking_number || trackingNumber,
        tracking_url: fulfillment.tracking_url || trackingUrl,
        created_at: fulfillment.created_at
      },
      message: 'Fulfillment created successfully'
    }
  } catch (error: any) {
    logger.error('[Shopify] Create fulfillment error:', error)
    return {
      success: false,
      output: { success: false },
      message: error.message || 'Failed to create fulfillment'
    }
  }
}
