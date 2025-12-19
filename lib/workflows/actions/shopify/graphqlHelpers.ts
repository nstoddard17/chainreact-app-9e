/**
 * Shopify GraphQL Helper Functions
 * Shared utilities for GraphQL-based Shopify actions
 */

/**
 * Extract numeric ID from Shopify GID
 * Example: gid://shopify/Product/123456789 → 123456789
 */
export function extractNumericId(gid: string): string {
  if (gid && gid.includes('gid://shopify/')) {
    return gid.split('/').pop() || gid
  }
  return gid
}

/**
 * Convert numeric ID to Shopify GID format
 */
export function toGid(type: string, id: string | number): string {
  const idStr = String(id)
  if (idStr.includes('gid://shopify/')) {
    return idStr
  }
  return `gid://shopify/${type}/${idStr}`
}

/**
 * Helper functions for specific resource types
 */
export const toProductGid = (id: string | number) => toGid('Product', id)
export const toVariantGid = (id: string | number) => toGid('ProductVariant', id)
export const toCustomerGid = (id: string | number) => toGid('Customer', id)
export const toOrderGid = (id: string | number) => toGid('Order', id)
export const toInventoryItemGid = (id: string | number) => toGid('InventoryItem', id)
export const toLocationGid = (id: string | number) => toGid('Location', id)
export const toFulfillmentOrderGid = (id: string | number) => toGid('FulfillmentOrder', id)
