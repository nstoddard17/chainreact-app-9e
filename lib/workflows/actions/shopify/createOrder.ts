import { ActionResult } from '../index'
import { makeShopifyGraphQLRequest, validateShopifyIntegration, getShopDomain } from '@/app/api/integrations/shopify/data/utils'
import { getIntegrationById } from '../../executeNode'
import { resolveValue } from '../core/resolveValue'
import { logger } from '@/lib/utils/logger'

/**
 * Extract numeric ID from Shopify GID
 */
function extractNumericId(gid: string): string {
  if (gid.includes('gid://shopify/')) {
    return gid.split('/').pop() || gid
  }
  return gid
}

/**
 * Create Shopify Order (GraphQL)
 * Creates a new order with full address support
 *
 * Enhanced with:
 * - Shipping address (6 fields)
 * - Billing address (6 fields)
 * - Line items with variant IDs
 * - Tags, notes, and financial status
 */
export async function createShopifyOrder(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // 1. Get and validate the integration
    const integrationId = await resolveValue(config.integration_id || config.integrationId, input)
    const integration = await getIntegrationById(integrationId)
    validateShopifyIntegration(integration)

    const selectedStore = config.shopify_store ? await resolveValue(config.shopify_store, input) : undefined

    // 2. Resolve all config values
    const email = await resolveValue(config.customer_email || config.email, input)
    const financialStatus = config.financial_status
      ? await resolveValue(config.financial_status, input)
      : 'PENDING'

    // Line items (required)
    const lineItems = config.line_items
      ? await resolveValue(config.line_items, input)
      : []

    // Optional fields
    const tags = config.tags ? await resolveValue(config.tags, input) : undefined
    const note = config.note ? await resolveValue(config.note, input) : undefined

    // Shipping address fields
    const shippingLine1 = config.shipping_address_line1 ? await resolveValue(config.shipping_address_line1, input) : undefined
    const shippingLine2 = config.shipping_address_line2 ? await resolveValue(config.shipping_address_line2, input) : undefined
    const shippingCity = config.shipping_city ? await resolveValue(config.shipping_city, input) : undefined
    const shippingProvince = config.shipping_province ? await resolveValue(config.shipping_province, input) : undefined
    const shippingCountry = config.shipping_country ? await resolveValue(config.shipping_country, input) : undefined
    const shippingZip = config.shipping_zip ? await resolveValue(config.shipping_zip, input) : undefined

    // Billing address fields
    const billingLine1 = config.billing_address_line1 ? await resolveValue(config.billing_address_line1, input) : undefined
    const billingLine2 = config.billing_address_line2 ? await resolveValue(config.billing_address_line2, input) : undefined
    const billingCity = config.billing_city ? await resolveValue(config.billing_city, input) : undefined
    const billingProvince = config.billing_province ? await resolveValue(config.billing_province, input) : undefined
    const billingCountry = config.billing_country ? await resolveValue(config.billing_country, input) : undefined
    const billingZip = config.billing_zip ? await resolveValue(config.billing_zip, input) : undefined

    logger.debug('[Shopify GraphQL] Creating order:', { email, lineItemCount: lineItems.length })

    // 3. Build GraphQL mutation
    const mutation = `
      mutation orderCreate($order: OrderCreateOrderInput!) {
        orderCreate(order: $order) {
          order {
            id
            name
            email
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            displayFinancialStatus
            createdAt
          }
          userErrors {
            field
            message
          }
        }
      }
    `

    const variables: any = {
      order: {
        email,
        lineItems: lineItems.map((item: any) => ({
          variantId: item.variant_id?.includes('gid://') ? item.variant_id : `gid://shopify/ProductVariant/${item.variant_id}`,
          quantity: item.quantity || 1
        })),
        financialStatus: financialStatus.toUpperCase(),
      }
    }

    // Add shipping address if provided
    if (shippingLine1 || shippingCity || shippingCountry || shippingZip) {
      variables.order.shippingAddress = {}
      if (shippingLine1) variables.order.shippingAddress.address1 = shippingLine1
      if (shippingLine2) variables.order.shippingAddress.address2 = shippingLine2
      if (shippingCity) variables.order.shippingAddress.city = shippingCity
      if (shippingProvince) variables.order.shippingAddress.province = shippingProvince
      if (shippingCountry) variables.order.shippingAddress.countryCode = shippingCountry
      if (shippingZip) variables.order.shippingAddress.zip = shippingZip
    }

    // Add billing address if provided
    if (billingLine1 || billingCity || billingCountry || billingZip) {
      variables.order.billingAddress = {}
      if (billingLine1) variables.order.billingAddress.address1 = billingLine1
      if (billingLine2) variables.order.billingAddress.address2 = billingLine2
      if (billingCity) variables.order.billingAddress.city = billingCity
      if (billingProvince) variables.order.billingAddress.province = billingProvince
      if (billingCountry) variables.order.billingAddress.countryCode = billingCountry
      if (billingZip) variables.order.billingAddress.zip = billingZip
    }

    if (tags) variables.order.tags = tags.split(',').map((t: string) => t.trim())
    if (note) variables.order.note = note

    // 4. Make GraphQL request
    const result = await makeShopifyGraphQLRequest(integration, mutation, variables, selectedStore)

    const order = result.orderCreate.order
    const shopDomain = getShopDomain(integration, selectedStore)
    const orderId = extractNumericId(order.id)

    return {
      success: true,
      output: {
        success: true,
        order_id: orderId,
        order_gid: order.id,
        order_number: order.name,
        admin_url: `https://${shopDomain}/admin/orders/${orderId}`,
        total_price: order.totalPriceSet.shopMoney.amount,
        currency: order.totalPriceSet.shopMoney.currencyCode,
        financial_status: order.displayFinancialStatus,
        created_at: order.createdAt,
      },
      message: 'Order created successfully',
    }
  } catch (error: any) {
    logger.error('[Shopify GraphQL] Create order error:', error)
    return {
      success: false,
      output: { success: false },
      message: error.message || 'Failed to create order',
    }
  }
}
