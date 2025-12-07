/**
 * Shopify Variants Handler
 * Fetches variants for a specific product
 */

import { ShopifyIntegration, ShopifyVariant, ShopifyDataHandler } from '../types'
import { makeShopifyRequest } from '../utils'
import { logger } from '@/lib/utils/logger'

export const getShopifyVariants: ShopifyDataHandler<ShopifyVariant[]> = async (
  integration: ShopifyIntegration,
  options?: any
): Promise<ShopifyVariant[]> => {
  try {
    const selectedStore = options?.shopify_store || options?.selectedStore
    const productId = options?.product_id || options?.productId

    if (!productId) {
      logger.debug('[Shopify] No product_id provided for variants, returning empty array')
      return []
    }

    // Fetch variants for the specific product
    const response = await makeShopifyRequest(
      integration,
      `products/${productId}.json?fields=variants`,
      {},
      selectedStore
    )

    const variants: ShopifyVariant[] = (response.product?.variants || []).map((variant: any) => {
      // Create descriptive label with variant details
      const variantTitle = variant.title !== 'Default Title' ? variant.title : 'Standard'
      const price = variant.price ? ` - $${variant.price}` : ''
      const sku = variant.sku ? ` (SKU: ${variant.sku})` : ''
      const inventory = variant.inventory_quantity !== undefined
        ? ` [${variant.inventory_quantity} in stock]`
        : ''

      const label = `${variantTitle}${price}${sku}${inventory}`

      return {
        id: String(variant.id),
        value: String(variant.id),
        label,
        product_id: String(productId),
        title: variant.title,
        price: variant.price,
        sku: variant.sku,
        inventory_quantity: variant.inventory_quantity,
        available: variant.available || variant.inventory_quantity > 0
      }
    })

    logger.debug(`✅ [Shopify] Fetched ${variants.length} variants for product ${productId}`)
    return variants

  } catch (error: any) {
    logger.error('❌ [Shopify] Error fetching variants:', error)
    throw new Error(error.message || 'Error fetching Shopify product variants')
  }
}
