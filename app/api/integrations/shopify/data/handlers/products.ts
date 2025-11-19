/**
 * Shopify Products Handler
 */

import { ShopifyIntegration, ShopifyProduct, ShopifyDataHandler } from '../types'
import { makeShopifyRequest } from '../utils'
import { logger } from '@/lib/utils/logger'

export const getShopifyProducts: ShopifyDataHandler<ShopifyProduct[]> = async (
  integration: ShopifyIntegration,
  options?: any
): Promise<ShopifyProduct[]> => {
  try {
    const selectedStore = options?.shopify_store || options?.selectedStore

    // Fetch products from Shopify (limit to 250 most recent)
    const response = await makeShopifyRequest(
      integration,
      'products.json?limit=250&fields=id,title,vendor,product_type,status',
      {},
      selectedStore
    )

    const products: ShopifyProduct[] = (response.products || []).map((product: any) => {
      // Create a descriptive label with vendor and product type if available
      const vendor = product.vendor ? ` (${product.vendor})` : ''
      const productType = product.product_type ? ` - ${product.product_type}` : ''
      const label = `${product.title}${vendor}${productType}`

      return {
        id: String(product.id),
        value: String(product.id),
        label,
        name: label,
        title: product.title,
        vendor: product.vendor,
        product_type: product.product_type,
        status: product.status
      }
    })

    logger.debug(`✅ [Shopify] Fetched ${products.length} products`)
    return products

  } catch (error: any) {
    logger.error('❌ [Shopify] Error fetching products:', error)
    throw new Error(error.message || 'Error fetching Shopify products')
  }
}
