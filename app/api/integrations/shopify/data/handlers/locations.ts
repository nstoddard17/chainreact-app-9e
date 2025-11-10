/**
 * Shopify Locations Handler
 */

import { ShopifyIntegration, ShopifyLocation, ShopifyDataHandler } from '../types'
import { makeShopifyRequest } from '../utils'
import { logger } from '@/lib/utils/logger'

export const getShopifyLocations: ShopifyDataHandler<ShopifyLocation[]> = async (
  integration: ShopifyIntegration,
  options?: any
): Promise<ShopifyLocation[]> => {
  try {
    const selectedStore = options?.shopify_store || options?.selectedStore
    const response = await makeShopifyRequest(integration, 'locations.json', {}, selectedStore)

    const locations: ShopifyLocation[] = (response.locations || []).map((location: any) => ({
      id: String(location.id),
      name: location.name,
      address1: location.address1,
      city: location.city,
      active: location.active !== false
    }))

    logger.debug(`✅ [Shopify] Fetched ${locations.length} locations`)
    return locations

  } catch (error: any) {
    logger.error('❌ [Shopify] Error fetching locations:', error)
    throw new Error(error.message || 'Error fetching Shopify locations')
  }
}
