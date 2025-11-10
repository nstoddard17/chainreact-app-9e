import { ActionResult } from '../index'
import { makeShopifyRequest, validateShopifyIntegration, getShopDomain } from '@/app/api/integrations/shopify/data/utils'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { logger } from '@/lib/utils/logger'

/**
 * Extract numeric ID from Shopify GID format
 * Example: gid://shopify/ProductVariant/123456789 → 123456789
 */
function extractNumericId(id: string): string {
  if (id.includes('gid://')) {
    return id.split('/').pop() || id
  }
  return id
}

/**
 * Update Shopify Product Variant
 * Updates an existing variant's properties (price, SKU, inventory, weight, barcode, options)
 */
export async function updateShopifyProductVariant(
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
    const variantId = await resolveValue(config.variant_id, input)
    const price = config.price ? await resolveValue(config.price, input) : undefined
    const sku = config.sku ? await resolveValue(config.sku, input) : undefined
    const inventoryQuantity = config.inventory_quantity ? await resolveValue(config.inventory_quantity, input) : undefined
    const weight = config.weight ? await resolveValue(config.weight, input) : undefined
    const barcode = config.barcode ? await resolveValue(config.barcode, input) : undefined
    const option1 = config.option1 ? await resolveValue(config.option1, input) : undefined
    const option2 = config.option2 ? await resolveValue(config.option2, input) : undefined
    const option3 = config.option3 ? await resolveValue(config.option3, input) : undefined

    // 3. Build payload (only include fields that were provided)
    const payload: any = {}
    if (price) payload.price = price
    if (sku) payload.sku = sku
    if (weight) payload.weight = parseFloat(weight)
    if (barcode) payload.barcode = barcode
    if (option1) payload.option1 = option1
    if (option2) payload.option2 = option2
    if (option3) payload.option3 = option3

    // Handle inventory quantity (requires inventory_management)
    if (inventoryQuantity !== undefined) {
      payload.inventory_quantity = parseInt(inventoryQuantity)
      payload.inventory_management = 'shopify'
    }

    // 4. Extract numeric ID from GID if needed
    const numericVariantId = extractNumericId(variantId)

    logger.debug('[Shopify] Updating product variant:', { variantId: numericVariantId, payload })

    // 5. Make API request
    const result = await makeShopifyRequest(integration, `variants/${numericVariantId}.json`, {
      method: 'PUT',
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
        admin_url: `https://${shopDomain}/admin/products/${variant.product_id}/variants/${variant.id}`,
        updated_at: variant.updated_at
      },
      message: 'Product variant updated successfully'
    }
  } catch (error: any) {
    logger.error('[Shopify] Update product variant error:', error)
    return {
      success: false,
      output: { success: false },
      message: error.message || 'Failed to update product variant'
    }
  }
}
