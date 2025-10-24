/**
 * Shopify Data API Types
 */

export interface ShopifyIntegration {
  id: string
  user_id: string
  provider: string
  status: 'connected' | 'disconnected' | 'error'
  access_token: string
  shop_domain?: string
  created_at: string
  updated_at: string
}

export interface ShopifyCollection {
  id: string
  title: string
  handle: string
  products_count?: number
}

export interface ShopifyLocation {
  id: string
  name: string
  address1?: string
  city?: string
  active: boolean
}

export interface ShopifyProduct {
  id: string
  title: string
  vendor?: string
  product_type?: string
  status: string
}

export interface ShopifyCustomer {
  id: string
  email: string
  first_name?: string
  last_name?: string
  orders_count: number
  total_spent: string
}

export interface ShopifyApiError extends Error {
  status?: number
  code?: string
}

export type ShopifyDataHandler<T = any> = (
  integration: ShopifyIntegration,
  options?: any
) => Promise<T>
