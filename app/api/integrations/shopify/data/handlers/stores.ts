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
          id: legacyShop
        }]
      }
    }

    logger.debug(`✅ [Shopify] Returning ${stores.length} connected stores`)
    return stores

  } catch (error: any) {
    logger.error('❌ [Shopify] Error fetching stores:', error)
    throw new Error(error.message || 'Error fetching Shopify stores')
  }
}
