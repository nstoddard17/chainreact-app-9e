/**
 * Shopify Data Handlers
 */

import { getShopifyCollections } from './collections'
import { getShopifyCustomers } from './customers'
import { getShopifyInventoryItems } from './inventory-items'
import { getShopifyLocations } from './locations'
import { getShopifyOrders } from './orders'
import { getShopifyProducts } from './products'
import { getShopifyStores } from './stores'
import { getShopifyVariants } from './variants'
import { ShopifyDataHandler } from '../types'

export const shopifyHandlers: Record<string, ShopifyDataHandler> = {
  'shopify_collections': getShopifyCollections,
  'shopify_customers': getShopifyCustomers,
  'shopify_inventory_items': getShopifyInventoryItems,
  'shopify_locations': getShopifyLocations,
  'shopify_orders': getShopifyOrders,
  'shopify_products': getShopifyProducts,
  'shopify_stores': getShopifyStores,
  'shopify_variants': getShopifyVariants,
}

export function isShopifyDataTypeSupported(dataType: string): boolean {
  return dataType in shopifyHandlers
}

export function getAvailableShopifyDataTypes(): string[] {
  return Object.keys(shopifyHandlers)
}
