/**
 * Shopify Data Handlers
 */

import { getShopifyCollections } from './collections'
import { getShopifyLocations } from './locations'
import { getShopifyStores } from './stores'
import { ShopifyDataHandler } from '../types'

export const shopifyHandlers: Record<string, ShopifyDataHandler> = {
  'shopify_collections': getShopifyCollections,
  'shopify_locations': getShopifyLocations,
  'shopify_stores': getShopifyStores,
}

export function isShopifyDataTypeSupported(dataType: string): boolean {
  return dataType in shopifyHandlers
}

export function getAvailableShopifyDataTypes(): string[] {
  return Object.keys(shopifyHandlers)
}
