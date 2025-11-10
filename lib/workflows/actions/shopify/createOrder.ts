import { ActionResult } from '../index'
import { makeShopifyRequest, validateShopifyIntegration, getShopDomain } from '@/app/api/integrations/shopify/data/utils'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { logger } from '@/lib/utils/logger'

/**
 * Create Shopify Order
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
    // 1. Get and validate integration
    const integrationId = await resolveValue(config.integration_id || config.integrationId, input)
    const integration = await getDecryptedAccessToken(integrationId, userId, 'shopify')
    validateShopifyIntegration(integration)

    // 2. Resolve all config values
    const email = await resolveValue(config.email, input)
    const financialStatus = config.financial_status
      ? await resolveValue(config.financial_status, input)
      : 'pending'

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

    // 3. Build shipping address (if any field provided)
    let shippingAddress: any = undefined
    if (shippingLine1 || shippingCity || shippingCountry || shippingZip) {
      shippingAddress = {}
      if (shippingLine1) shippingAddress.address1 = shippingLine1
      if (shippingLine2) shippingAddress.address2 = shippingLine2
      if (shippingCity) shippingAddress.city = shippingCity
      if (shippingProvince) shippingAddress.province = shippingProvince
      if (shippingCountry) shippingAddress.country = shippingCountry
      if (shippingZip) shippingAddress.zip = shippingZip
    }

    // 4. Build billing address (if any field provided, otherwise defaults to shipping)
    let billingAddress: any = undefined
    if (billingLine1 || billingCity || billingCountry || billingZip) {
      billingAddress = {}
      if (billingLine1) billingAddress.address1 = billingLine1
      if (billingLine2) billingAddress.address2 = billingLine2
      if (billingCity) billingAddress.city = billingCity
      if (billingProvince) billingAddress.province = billingProvince
      if (billingCountry) billingAddress.country = billingCountry
      if (billingZip) billingAddress.zip = billingZip
    } else if (shippingAddress) {
      // Default billing to shipping if shipping provided but billing not
      billingAddress = { ...shippingAddress }
    }

    // 5. Build order payload
    const payload: any = {
      email,
      line_items: lineItems,
      financial_status: financialStatus,
    }

    if (tags) payload.tags = tags
    if (note) payload.note = note
    if (shippingAddress) payload.shipping_address = shippingAddress
    if (billingAddress) payload.billing_address = billingAddress

    logger.debug('[Shopify] Creating order:', {
      email,
      lineItemCount: lineItems.length,
      hasShippingAddress: !!shippingAddress,
      hasBillingAddress: !!billingAddress,
    })

    // 6. Make API request
    const result = await makeShopifyRequest(integration, 'orders.json', {
      method: 'POST',
      body: JSON.stringify({ order: payload }),
    })

    const order = result.order
    const shopDomain = getShopDomain(integration)

    return {
      success: true,
      output: {
        success: true,
        order_id: order.id,
        order_number: order.order_number,
        admin_url: `https://${shopDomain}/admin/orders/${order.id}`,
        total_price: order.total_price,
        currency: order.currency,
        financial_status: order.financial_status,
        created_at: order.created_at,
      },
      message: 'Order created successfully',
    }
  } catch (error: any) {
    logger.error('[Shopify] Create order error:', error)
    return {
      success: false,
      output: { success: false },
      message: error.message || 'Failed to create order',
    }
  }
}
