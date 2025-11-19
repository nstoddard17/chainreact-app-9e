/**
 * Shopify Orders Handler
 */

import { ShopifyIntegration, ShopifyDataHandler } from '../types'
import { makeShopifyRequest } from '../utils'
import { logger } from '@/lib/utils/logger'

export interface ShopifyOrder {
  id: string
  name: string // Order number (e.g., "#1001")
  email: string
  financial_status: string
  fulfillment_status: string | null
  total_price: string
  created_at: string
}

export const getShopifyOrders: ShopifyDataHandler<ShopifyOrder[]> = async (
  integration: ShopifyIntegration,
  options?: any
): Promise<ShopifyOrder[]> => {
  try {
    const selectedStore = options?.shopify_store || options?.selectedStore

    // Fetch recent orders from Shopify (limit to 250 most recent)
    const response = await makeShopifyRequest(
      integration,
      'orders.json?limit=250&status=any&fields=id,name,email,financial_status,fulfillment_status,total_price,created_at',
      {},
      selectedStore
    )

    const orders: ShopifyOrder[] = (response.orders || []).map((order: any) => {
      // Create a descriptive label with order number, customer, and price
      const price = order.total_price ? ` - $${order.total_price}` : ''
      const email = order.email ? ` (${order.email})` : ''
      const label = `${order.name}${email}${price}`

      return {
        id: String(order.id),
        value: String(order.id),
        label,
        name: order.name,
        email: order.email,
        financial_status: order.financial_status,
        fulfillment_status: order.fulfillment_status,
        total_price: order.total_price,
        created_at: order.created_at
      }
    })

    logger.debug(`✅ [Shopify] Fetched ${orders.length} orders`)
    return orders

  } catch (error: any) {
    logger.error('❌ [Shopify] Error fetching orders:', error)
    throw new Error(error.message || 'Error fetching Shopify orders')
  }
}
