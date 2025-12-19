import { ActionResult } from '../index'
import { makeShopifyGraphQLRequest, validateShopifyIntegration, getShopDomain } from '@/app/api/integrations/shopify/data/utils'
import { getIntegrationById } from '../../executeNode'
import { resolveValue } from '../core/resolveValue'
import { logger } from '@/lib/utils/logger'
import { extractNumericId, toOrderGid } from './graphqlHelpers'

/**
 * Create Shopify Fulfillment (GraphQL)
 * Creates a fulfillment for an order with optional tracking information
 *
 * Uses fulfillmentCreateV2 mutation which works with FulfillmentOrders
 */
export async function createShopifyFulfillment(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // 1. Get and validate integration
    const integrationId = await resolveValue(config.integration_id || config.integrationId, input)
    const integration = await getIntegrationById(integrationId)
    validateShopifyIntegration(integration)
    const selectedStore = config.shopify_store ? await resolveValue(config.shopify_store, input) : undefined

    // 2. Resolve config values
    const orderId = await resolveValue(config.order_id, input)
    const trackingNumber = config.tracking_number ? await resolveValue(config.tracking_number, input) : undefined
    const trackingCompany = config.tracking_company ? await resolveValue(config.tracking_company, input) : undefined
    const trackingUrl = config.tracking_url ? await resolveValue(config.tracking_url, input) : undefined
    const notifyCustomer = config.notify_customer !== undefined
      ? await resolveValue(config.notify_customer, input) === 'true' || await resolveValue(config.notify_customer, input) === true
      : true

    // 3. Convert to GID format
    const orderGid = toOrderGid(orderId)
    const numericOrderId = extractNumericId(orderGid)

    logger.debug('[Shopify GraphQL] Creating fulfillment for order:', { orderId: orderGid })

    // 4. Query for fulfillment orders
    const fulfillmentOrderQuery = `
      query getOrderFulfillmentOrders($id: ID!) {
        order(id: $id) {
          id
          fulfillmentOrders(first: 10) {
            edges {
              node {
                id
                status
                lineItems(first: 50) {
                  edges {
                    node {
                      id
                      remainingQuantity
                    }
                  }
                }
              }
            }
          }
        }
      }
    `

    const orderData = await makeShopifyGraphQLRequest(
      integration,
      fulfillmentOrderQuery,
      { id: orderGid },
      selectedStore
    )

    const fulfillmentOrders = orderData.order.fulfillmentOrders.edges.map((edge: any) => edge.node)

    if (!fulfillmentOrders || fulfillmentOrders.length === 0) {
      throw new Error('No fulfillment orders found for this order')
    }

    // 5. Find the first open/scheduled fulfillment order
    const fulfillmentOrder = fulfillmentOrders.find((fo: any) =>
      fo.status === 'OPEN' || fo.status === 'SCHEDULED'
    ) || fulfillmentOrders[0]

    // 6. Build line items for fulfillment
    const fulfillmentOrderLineItems = fulfillmentOrder.lineItems.edges
      .filter((edge: any) => edge.node.remainingQuantity > 0)
      .map((edge: any) => ({
        id: edge.node.id,
        quantity: edge.node.remainingQuantity
      }))

    // 7. Build fulfillment mutation
    const mutation = `
      mutation fulfillmentCreateV2($fulfillment: FulfillmentV2Input!) {
        fulfillmentCreateV2(fulfillment: $fulfillment) {
          fulfillment {
            id
            status
            trackingInfo {
              number
              url
              company
            }
            createdAt
          }
          userErrors {
            field
            message
          }
        }
      }
    `

    const fulfillmentInput: any = {
      lineItemsByFulfillmentOrder: [
        {
          fulfillmentOrderId: fulfillmentOrder.id,
          fulfillmentOrderLineItems
        }
      ],
      notifyCustomer
    }

    // Add tracking info if provided
    if (trackingNumber || trackingCompany || trackingUrl) {
      fulfillmentInput.trackingInfo = {}
      if (trackingNumber) fulfillmentInput.trackingInfo.number = trackingNumber
      if (trackingCompany) fulfillmentInput.trackingInfo.company = trackingCompany
      if (trackingUrl) fulfillmentInput.trackingInfo.url = trackingUrl
    }

    // 8. Create fulfillment
    const result = await makeShopifyGraphQLRequest(integration, mutation, {
      fulfillment: fulfillmentInput
    }, selectedStore)

    const fulfillment = result.fulfillmentCreateV2.fulfillment
    const shopDomain = getShopDomain(integration, selectedStore)
    const fulfillmentId = extractNumericId(fulfillment.id)

    return {
      success: true,
      output: {
        success: true,
        fulfillment_id: fulfillmentId,
        fulfillment_gid: fulfillment.id,
        order_id: numericOrderId,
        order_gid: orderGid,
        status: fulfillment.status,
        tracking_number: fulfillment.trackingInfo?.[0]?.number || trackingNumber,
        tracking_url: fulfillment.trackingInfo?.[0]?.url || trackingUrl,
        admin_url: `https://${shopDomain}/admin/orders/${numericOrderId}`,
        created_at: fulfillment.createdAt
      },
      message: 'Fulfillment created successfully'
    }
  } catch (error: any) {
    logger.error('[Shopify GraphQL] Create fulfillment error:', error)
    return {
      success: false,
      output: { success: false },
      message: error.message || 'Failed to create fulfillment'
    }
  }
}
