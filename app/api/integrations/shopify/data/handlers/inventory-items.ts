/**
 * Shopify Inventory Items Handler
 */

import { ShopifyIntegration, ShopifyDataHandler } from '../types'
import { makeShopifyRequest } from '../utils'
import { logger } from '@/lib/utils/logger'

export interface ShopifyInventoryItem {
  id: string
  value: string
  label: string
  name: string
  sku: string
  product_title: string
  variant_title: string
}

export const getShopifyInventoryItems: ShopifyDataHandler<ShopifyInventoryItem[]> = async (
  integration: ShopifyIntegration,
  options?: any
): Promise<ShopifyInventoryItem[]> => {
  try {
    const selectedStore = options?.shopify_store || options?.selectedStore

    // Fetch products with their variants to get inventory item IDs
    const response = await makeShopifyRequest(
      integration,
      'products.json?limit=250&fields=id,title,variants',
      {},
      selectedStore
    )

    const inventoryItems: ShopifyInventoryItem[] = []

    for (const product of response.products || []) {
      for (const variant of product.variants || []) {
        if (variant.inventory_item_id) {
          const sku = variant.sku || 'No SKU'
          const variantTitle = variant.title !== 'Default Title' ? variant.title : ''

          // Create a user-friendly display label
          // Format: "Product Name - Variant (SKU: ABC123)" or "Product Name (SKU: ABC123)"
          const label = variantTitle
            ? `${product.title} - ${variantTitle} (SKU: ${sku})`
            : `${product.title} (SKU: ${sku})`

          inventoryItems.push({
            id: String(variant.inventory_item_id),
            value: String(variant.inventory_item_id),
            label,
            name: label,
            sku,
            product_title: product.title,
            variant_title: variantTitle || 'Default'
          })
        }
      }
    }

    logger.debug(`✅ [Shopify] Fetched ${inventoryItems.length} inventory items`)
    return inventoryItems

  } catch (error: any) {
    logger.error('❌ [Shopify] Error fetching inventory items:', error)
    throw new Error(error.message || 'Error fetching Shopify inventory items')
  }
}
