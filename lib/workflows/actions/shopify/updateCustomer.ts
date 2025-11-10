import { ActionResult } from '../index'
import { makeShopifyRequest, validateShopifyIntegration, getShopDomain } from '@/app/api/integrations/shopify/data/utils'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { logger } from '@/lib/utils/logger'

/**
 * Extract numeric ID from Shopify GID format
 * Example: gid://shopify/Customer/123456789 → 123456789
 */
function extractNumericId(id: string): string {
  if (id.includes('gid://')) {
    return id.split('/').pop() || id
  }
  return id
}

/**
 * Update Shopify Customer
 * Updates customer information (email, name, phone, tags, marketing preferences, notes)
 */
export async function updateShopifyCustomer(
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
    const customerId = await resolveValue(config.customer_id, input)
    const email = config.email ? await resolveValue(config.email, input) : undefined
    const firstName = config.first_name ? await resolveValue(config.first_name, input) : undefined
    const lastName = config.last_name ? await resolveValue(config.last_name, input) : undefined
    const phone = config.phone ? await resolveValue(config.phone, input) : undefined
    const tags = config.tags ? await resolveValue(config.tags, input) : undefined
    const note = config.note ? await resolveValue(config.note, input) : undefined
    const acceptsMarketing = config.accepts_marketing ? await resolveValue(config.accepts_marketing, input) : undefined

    // 3. Build payload (only include fields that were provided)
    const payload: any = {}
    if (email) payload.email = email
    if (firstName) payload.first_name = firstName
    if (lastName) payload.last_name = lastName
    if (phone) payload.phone = phone
    if (tags) payload.tags = tags
    if (note) payload.note = note
    if (acceptsMarketing !== undefined && acceptsMarketing !== '') {
      payload.accepts_marketing = acceptsMarketing === 'true'
    }

    // 4. Extract numeric ID from GID if needed
    const numericId = extractNumericId(customerId)

    logger.debug('[Shopify] Updating customer:', { customerId: numericId, payload })

    // 5. Make API request
    const result = await makeShopifyRequest(integration, `customers/${numericId}.json`, {
      method: 'PUT',
      body: JSON.stringify({ customer: payload })
    })

    const customer = result.customer
    const shopDomain = getShopDomain(integration)

    return {
      success: true,
      output: {
        success: true,
        customer_id: customer.id,
        email: customer.email,
        admin_url: `https://${shopDomain}/admin/customers/${customer.id}`,
        updated_at: customer.updated_at
      },
      message: 'Customer updated successfully'
    }
  } catch (error: any) {
    logger.error('[Shopify] Update customer error:', error)
    return {
      success: false,
      output: { success: false },
      message: error.message || 'Failed to update customer'
    }
  }
}
