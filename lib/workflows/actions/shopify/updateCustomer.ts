import { ActionResult } from '../index'
import { makeShopifyGraphQLRequest, validateShopifyIntegration, getShopDomain } from '@/app/api/integrations/shopify/data/utils'
import { getIntegrationById } from '../../executeNode'
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
 * Convert numeric ID to Shopify GID format
 */
function toCustomerGid(id: string): string {
  if (id.includes('gid://shopify/')) {
    return id
  }
  return `gid://shopify/Customer/${id}`
}

/**
 * Update Shopify Customer (GraphQL)
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
    const integration = await getIntegrationById(integrationId)
    validateShopifyIntegration(integration)
    const selectedStore = config.shopify_store ? await resolveValue(config.shopify_store, input) : undefined

    // 2. Resolve all config values
    const customerId = await resolveValue(config.customer_id, input)
    const email = config.email ? await resolveValue(config.email, input) : undefined
    const firstName = config.first_name ? await resolveValue(config.first_name, input) : undefined
    const lastName = config.last_name ? await resolveValue(config.last_name, input) : undefined
    const phone = config.phone ? await resolveValue(config.phone, input) : undefined
    const tags = config.tags ? await resolveValue(config.tags, input) : undefined
    const note = config.note ? await resolveValue(config.note, input) : undefined
    const acceptsMarketing = config.accepts_marketing ? await resolveValue(config.accepts_marketing, input) : undefined

    // 3. Convert to GID format
    const customerGid = toCustomerGid(customerId)

    logger.debug('[Shopify GraphQL] Updating customer:', { customerId: customerGid })

    // 4. Build GraphQL mutation
    const mutation = `
      mutation customerUpdate($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer {
            id
            email
            firstName
            lastName
            phone
            tags
            note
            updatedAt
          }
          userErrors {
            field
            message
          }
        }
      }
    `

    const variables: any = {
      input: {
        id: customerGid
      }
    }

    if (email) variables.input.email = email
    if (firstName) variables.input.firstName = firstName
    if (lastName) variables.input.lastName = lastName
    if (phone) variables.input.phone = phone
    if (tags) variables.input.tags = tags.split(',').map((t: string) => t.trim())
    if (note) variables.input.note = note
    if (acceptsMarketing !== undefined && acceptsMarketing !== '') {
      variables.input.emailMarketingConsent = {
        marketingState: acceptsMarketing === 'true' ? 'SUBSCRIBED' : 'UNSUBSCRIBED'
      }
    }

    // 5. Make GraphQL request
    const result = await makeShopifyGraphQLRequest(integration, mutation, variables, selectedStore)

    const customer = result.customerUpdate.customer
    const shopDomain = getShopDomain(integration, selectedStore)
    const numericId = extractNumericId(customer.id)

    return {
      success: true,
      output: {
        success: true,
        customer_id: numericId,
        customer_gid: customer.id,
        email: customer.email,
        admin_url: `https://${shopDomain}/admin/customers/${numericId}`,
        updated_at: customer.updatedAt
      },
      message: 'Customer updated successfully'
    }
  } catch (error: any) {
    logger.error('[Shopify GraphQL] Update customer error:', error)
    return {
      success: false,
      output: { success: false },
      message: error.message || 'Failed to update customer'
    }
  }
}
