import { ActionResult } from '../index'
import { makeShopifyGraphQLRequest, validateShopifyIntegration, getShopDomain } from '@/app/api/integrations/shopify/data/utils'
import { getIntegrationById } from '../../executeNode'
import { resolveValue } from '../core/resolveValue'
import { logger } from '@/lib/utils/logger'

/**
 * Extract numeric ID from Shopify GID format
 * Example: gid://shopify/Product/123456789 → 123456789
 */
function extractNumericId(id: string): string {
  if (id.includes('gid://')) {
    return id.split('/').pop() || id
  }
  return id
}

/**
 * Convert numeric ID to Shopify GID format
 * Example: 123456789 → gid://shopify/Product/123456789
 */
function toProductGid(id: string): string {
  if (id.includes('gid://shopify/')) {
    return id
  }
  return `gid://shopify/Product/${id}`
}

/**
 * Update Shopify Product (GraphQL)
 * Updates an existing product's properties (title, description, tags, published status, etc.)
 */
export async function updateShopifyProduct(
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
    const productId = await resolveValue(config.product_id, input)
    const title = config.title ? await resolveValue(config.title, input) : undefined
    const bodyHtml = config.body_html ? await resolveValue(config.body_html, input) : undefined
    const vendor = config.vendor ? await resolveValue(config.vendor, input) : undefined
    const productType = config.product_type ? await resolveValue(config.product_type, input) : undefined
    const tags = config.tags ? await resolveValue(config.tags, input) : undefined
    const published = config.published ? await resolveValue(config.published, input) : undefined

    // 3. Convert to GID format
    const productGid = toProductGid(productId)

    logger.debug('[Shopify GraphQL] Updating product:', { productId: productGid })

    // 4. Build GraphQL mutation (only include fields that were provided)
    const mutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            title
            descriptionHtml
            vendor
            productType
            tags
            status
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
        id: productGid
      }
    }

    if (title) variables.input.title = title
    if (bodyHtml) variables.input.descriptionHtml = bodyHtml
    if (vendor) variables.input.vendor = vendor
    if (productType) variables.input.productType = productType
    if (tags) variables.input.tags = tags.split(',').map((t: string) => t.trim())
    if (published !== undefined && published !== '') {
      variables.input.status = published === 'true' ? 'ACTIVE' : 'DRAFT'
    }

    // 5. Make GraphQL request
    const result = await makeShopifyGraphQLRequest(integration, mutation, variables, selectedStore)

    const product = result.productUpdate.product
    const shopDomain = getShopDomain(integration, selectedStore)
    const numericId = extractNumericId(product.id)

    return {
      success: true,
      output: {
        success: true,
        product_id: numericId,
        product_gid: product.id,
        title: product.title,
        admin_url: `https://${shopDomain}/admin/products/${numericId}`,
        updated_at: product.updatedAt
      },
      message: 'Product updated successfully'
    }
  } catch (error: any) {
    logger.error('[Shopify GraphQL] Update product error:', error)
    return {
      success: false,
      output: { success: false },
      message: error.message || 'Failed to update product'
    }
  }
}
