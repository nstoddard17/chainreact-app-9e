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
 * Create Shopify Product Variant
 * Creates a new variant for an existing product (e.g., new size, color, material combination)
 */
export async function createShopifyProductVariant(
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
    const price = await resolveValue(config.price, input)
    const option1 = config.option1 ? await resolveValue(config.option1, input) : undefined
    const option2 = config.option2 ? await resolveValue(config.option2, input) : undefined
    const option3 = config.option3 ? await resolveValue(config.option3, input) : undefined
    const sku = config.sku ? await resolveValue(config.sku, input) : undefined
    const inventoryQuantity = config.inventory_quantity ? parseInt(await resolveValue(config.inventory_quantity, input)) : undefined
    const weight = config.weight ? parseFloat(await resolveValue(config.weight, input)) : undefined
    const barcode = config.barcode ? await resolveValue(config.barcode, input) : undefined

    // 3. Build variant payload
    const payload: any = {
      price: price
    }

    // Add option values (these determine the variant, e.g., "Large", "Red", "Cotton")
    if (option1) payload.option1 = option1
    if (option2) payload.option2 = option2
    if (option3) payload.option3 = option3

    // Add optional fields
    if (sku) payload.sku = sku
    if (inventoryQuantity !== undefined) {
      payload.inventory_quantity = inventoryQuantity
      payload.inventory_management = 'shopify' // Required when setting inventory_quantity
    }
    if (weight) payload.weight = weight
    if (barcode) payload.barcode = barcode

    // 4. Extract numeric ID from GID if needed
    const numericProductId = extractNumericId(productId)

    logger.debug('[Shopify] Creating product variant:', { productId: numericProductId, payload })

    // 5. Make API request
    const result = await makeShopifyRequest(integration, `products/${numericProductId}/variants.json`, {
      method: 'POST',
      body: JSON.stringify({ variant: payload })
    })

    const variant = result.variant
    const shopDomain = getShopDomain(integration)

    return {
      success: true,
      output: {
        success: true,
        variant_id: variant.id,
        product_id: variant.product_id,
        sku: variant.sku,
        price: variant.price,
        admin_url: `https://${shopDomain}/admin/products/${numericProductId}/variants/${variant.id}`,
        created_at: variant.created_at
      },
      message: 'Product variant created successfully'
    }
  } catch (error: any) {
    logger.error('[Shopify] Create product variant error:', error)
    return {
      success: false,
      output: { success: false },
      message: error.message || 'Failed to create product variant'
    }
  }
}
