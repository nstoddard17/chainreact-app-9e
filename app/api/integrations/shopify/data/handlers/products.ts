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
    // Include variants and options so we can populate variant dropdowns and option fields without additional API calls
    const response = await makeShopifyRequest(
      integration,
      'products.json?limit=250&fields=id,title,vendor,product_type,status,variants,options',
      {},
      selectedStore
    )

    const products: ShopifyProduct[] = (response.products || []).map((product: any) => {
      // Create a descriptive label with vendor and product type if available
      const vendor = product.vendor ? ` (${product.vendor})` : ''
      const productType = product.product_type ? ` - ${product.product_type}` : ''
      const label = `${product.title}${vendor}${productType}`

      // Format variants with descriptive labels
      const variants = (product.variants || []).map((variant: any) => {
        const variantTitle = variant.title !== 'Default Title' ? variant.title : 'Standard'
        const price = variant.price ? ` - $${variant.price}` : ''
        const sku = variant.sku ? ` (SKU: ${variant.sku})` : ''
        const inventory = variant.inventory_quantity !== undefined
          ? ` [${variant.inventory_quantity} in stock]`
          : ''

        return {
          id: String(variant.id),
          value: String(variant.id),
          label: `${variantTitle}${price}${sku}${inventory}`,
          product_id: String(product.id),
          title: variant.title,
          price: variant.price,
          sku: variant.sku,
          inventory_quantity: variant.inventory_quantity,
          available: variant.available || variant.inventory_quantity > 0
        }
      })

      return {
        id: String(product.id),
        value: String(product.id),
        label,
        name: label,
        title: product.title,
        vendor: product.vendor,
        product_type: product.product_type,
        status: product.status,
        variants, // Include variants array in the product object
        options: product.options || [] // Include options array for variant creation
      }
    })

    logger.debug(`✅ [Shopify] Fetched ${products.length} products`)
    return products

  } catch (error: any) {
    logger.error('❌ [Shopify] Error fetching products:', error)
    throw new Error(error.message || 'Error fetching Shopify products')
  }
}
