import { ActionResult } from '../index'
import { makeShopifyRequest, validateShopifyIntegration, getShopDomain } from '@/app/api/integrations/shopify/data/utils'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
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
 * Update Shopify Product
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
    const integration = await getDecryptedAccessToken(integrationId, userId, 'shopify')
    validateShopifyIntegration(integration)

    // 2. Resolve all config values
    const productId = await resolveValue(config.product_id, input)
    const title = config.title ? await resolveValue(config.title, input) : undefined
    const bodyHtml = config.body_html ? await resolveValue(config.body_html, input) : undefined
    const vendor = config.vendor ? await resolveValue(config.vendor, input) : undefined
    const productType = config.product_type ? await resolveValue(config.product_type, input) : undefined
    const tags = config.tags ? await resolveValue(config.tags, input) : undefined
    const published = config.published ? await resolveValue(config.published, input) : undefined

    // 3. Build payload (only include fields that were provided)
    const payload: any = {}
    if (title) payload.title = title
    if (bodyHtml) payload.body_html = bodyHtml
    if (vendor) payload.vendor = vendor
    if (productType) payload.product_type = productType
    if (tags) payload.tags = tags
    if (published !== undefined && published !== '') {
      payload.published = published === 'true'
    }

    // 4. Extract numeric ID from GID if needed
    const numericId = extractNumericId(productId)

    logger.debug('[Shopify] Updating product:', { productId: numericId, payload })

    // 5. Make API request
    const result = await makeShopifyRequest(integration, `products/${numericId}.json`, {
      method: 'PUT',
      body: JSON.stringify({ product: payload })
    })

    const product = result.product
    const shopDomain = getShopDomain(integration)

    return {
      success: true,
      output: {
        success: true,
        product_id: product.id,
        title: product.title,
        admin_url: `https://${shopDomain}/admin/products/${product.id}`,
        updated_at: product.updated_at
      },
      message: 'Product updated successfully'
    }
  } catch (error: any) {
    logger.error('[Shopify] Update product error:', error)
    return {
      success: false,
      output: { success: false },
      message: error.message || 'Failed to update product'
    }
  }
}
