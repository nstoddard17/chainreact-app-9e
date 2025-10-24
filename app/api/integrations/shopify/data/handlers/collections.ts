/**
 * Shopify Collections Handler
 */

import { ShopifyIntegration, ShopifyCollection, ShopifyDataHandler } from '../types'
import { makeShopifyRequest } from '../utils'
import { logger } from '@/lib/utils/logger'

export const getShopifyCollections: ShopifyDataHandler<ShopifyCollection[]> = async (
  integration: ShopifyIntegration
): Promise<ShopifyCollection[]> => {
  try {
    const response = await makeShopifyRequest(integration, 'custom_collections.json?limit=250')

    const collections: ShopifyCollection[] = (response.custom_collections || []).map((collection: any) => ({
      id: String(collection.id),
      title: collection.title,
      handle: collection.handle,
      products_count: collection.products_count
    }))

    // Also get smart collections
    const smartResponse = await makeShopifyRequest(integration, 'smart_collections.json?limit=250')

    const smartCollections: ShopifyCollection[] = (smartResponse.smart_collections || []).map((collection: any) => ({
      id: String(collection.id),
      title: collection.title,
      handle: collection.handle,
      products_count: collection.products_count
    }))

    const allCollections = [...collections, ...smartCollections]

    logger.debug(`✅ [Shopify] Fetched ${allCollections.length} collections`)
    return allCollections

  } catch (error: any) {
    logger.error('❌ [Shopify] Error fetching collections:', error)
    throw new Error(error.message || 'Error fetching Shopify collections')
  }
}
