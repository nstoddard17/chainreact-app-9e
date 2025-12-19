/**
 * Shopify Stores Handler
 * Returns list of connected Shopify stores from integration metadata
 */

import { ShopifyIntegration, ShopifyStore, ShopifyDataHandler } from '../types'
import { logger } from '@/lib/utils/logger'

export const getShopifyStores: ShopifyDataHandler<ShopifyStore[]> = async (
  integration: ShopifyIntegration
): Promise<ShopifyStore[]> => {
  try {
    const metadata = integration.metadata as any

    // Get stores from metadata
    const stores = metadata?.stores || []

    // If no stores in new format, check legacy single shop format
    if (stores.length === 0) {
      const legacyShop = metadata?.shop || integration.shop_domain
      if (legacyShop) {
        logger.debug('[Shopify] Using legacy single shop format')
        return [{
          shop: legacyShop,
          name: legacyShop,
          id: legacyShop,
          value: legacyShop, // Use shop domain as value for select fields
          label: legacyShop
        }]
      }
    }

    // Map stores to include value/label for select fields
    // IMPORTANT: Use 'shop' (domain) as the value, not numeric 'id'
    const mappedStores = stores.map((store: any) => ({
      ...store,
      value: store.shop, // The shop domain (e.g., "mystore.myshopify.com")
      label: store.name || store.shop, // Display name or fallback to domain
      id: store.id // Keep the numeric ID for reference
    }))

    logger.debug(`✅ [Shopify] Returning ${mappedStores.length} connected stores`)
    return mappedStores

  } catch (error: any) {
    logger.error('❌ [Shopify] Error fetching stores:', error)
    throw new Error(error.message || 'Error fetching Shopify stores')
  }
}
