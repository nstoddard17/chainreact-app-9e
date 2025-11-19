/**
 * Shopify Customers Handler
 */

import { ShopifyIntegration, ShopifyCustomer, ShopifyDataHandler } from '../types'
import { makeShopifyRequest } from '../utils'
import { logger } from '@/lib/utils/logger'

export const getShopifyCustomers: ShopifyDataHandler<ShopifyCustomer[]> = async (
  integration: ShopifyIntegration,
  options?: any
): Promise<ShopifyCustomer[]> => {
  try {
    const selectedStore = options?.shopify_store || options?.selectedStore

    // Fetch recent customers from Shopify (limit to 250 most recent)
    const response = await makeShopifyRequest(
      integration,
      'customers.json?limit=250&fields=id,email,first_name,last_name,orders_count,total_spent',
      {},
      selectedStore
    )

    const customers: ShopifyCustomer[] = (response.customers || []).map((customer: any) => {
      // Create a descriptive label with name and email
      const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(' ')
      const name = fullName || customer.email
      const email = fullName ? ` (${customer.email})` : ''
      const orderInfo = customer.orders_count > 0 ? ` - ${customer.orders_count} orders` : ''
      const label = `${name}${email}${orderInfo}`

      return {
        id: String(customer.id),
        value: String(customer.id),
        label,
        name: label,
        email: customer.email,
        first_name: customer.first_name,
        last_name: customer.last_name,
        orders_count: customer.orders_count,
        total_spent: customer.total_spent
      }
    })

    logger.debug(`✅ [Shopify] Fetched ${customers.length} customers`)
    return customers

  } catch (error: any) {
    logger.error('❌ [Shopify] Error fetching customers:', error)
    throw new Error(error.message || 'Error fetching Shopify customers')
  }
}
