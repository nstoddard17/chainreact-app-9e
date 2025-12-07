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
 * Create Shopify Customer (GraphQL)
 * Creates a new customer in Shopify with email, name, phone, tags, and marketing preferences
 */
export async function createShopifyCustomer(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // 1. Get and validate integration
    const integrationId = await resolveValue(config.integration_id || config.integrationId, input)
    const integration = await getIntegrationById(integrationId)
    validateShopifyIntegration(integration)

    // 2. Resolve all config values (including shopify_store for multi-store support)
    const selectedStore = config.shopify_store ? await resolveValue(config.shopify_store, input) : undefined
    const email = await resolveValue(config.email, input)
    const firstName = config.first_name ? await resolveValue(config.first_name, input) : undefined
    const lastName = config.last_name ? await resolveValue(config.last_name, input) : undefined
    const phone = config.phone ? await resolveValue(config.phone, input) : undefined
    const tags = config.tags ? await resolveValue(config.tags, input) : undefined
    const sendWelcomeEmail = config.send_welcome_email ?? false

    logger.debug('[Shopify GraphQL] Creating customer:', { email, selectedStore })

    // 3. Build GraphQL mutation
    const mutation = `
      mutation customerCreate($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer {
            id
            email
            firstName
            lastName
            phone
            tags
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
      input: {
        email
      }
    }

    if (firstName) variables.input.firstName = firstName
    if (lastName) variables.input.lastName = lastName
    if (phone) variables.input.phone = phone
    if (tags) variables.input.tags = tags.split(',').map((t: string) => t.trim())
    if (sendWelcomeEmail) variables.input.emailMarketingConsent = { marketingState: 'SUBSCRIBED' }

    // 4. Make GraphQL request
    const result = await makeShopifyGraphQLRequest(integration, mutation, variables, selectedStore)

    const customer = result.customerCreate.customer
    const shopDomain = getShopDomain(integration, selectedStore)
    const customerId = extractNumericId(customer.id)

    return {
      success: true,
      output: {
        customer_id: customerId,
        customer_gid: customer.id,
        email: customer.email,
        admin_url: `https://${shopDomain}/admin/customers/${customerId}`,
        created_at: customer.createdAt
      },
      message: 'Customer created successfully'
    }
  } catch (error: any) {
    logger.error('[Shopify GraphQL] Create customer error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create customer'
    }
  }
}