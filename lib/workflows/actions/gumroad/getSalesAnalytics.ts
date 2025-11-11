import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Gets sales analytics/statistics from Gumroad
 */
export async function getGumroadSalesAnalytics(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "gumroad")
    const productId = resolveValue(config.productId, input)
    const after = resolveValue(config.after, input)
    const before = resolveValue(config.before, input)
    const email = resolveValue(config.email, input)
    const orderId = resolveValue(config.orderId, input)
    const pageSize = resolveValue(config.pageSize, input) || 100

    // Build query parameters
    const params = new URLSearchParams({
      access_token: accessToken
    })

    if (productId) params.append('product_id', productId)
    if (after) params.append('after', after)
    if (before) params.append('before', before)
    if (email) params.append('email', email)
    if (orderId) params.append('order_id', orderId)
    params.append('page_key', '1')
    params.append('page_size', pageSize.toString())

    const url = `https://api.gumroad.com/v2/sales?${params.toString()}`

    logger.debug('[getGumroadSalesAnalytics] Fetching sales analytics:', {
      productId,
      after,
      before,
      email,
      orderId,
      pageSize
    })

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to get sales analytics: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()
    const sales = result.sales || []

    // Calculate analytics
    const totalSales = sales.length
    const totalRevenue = sales.reduce((sum: number, sale: any) => sum + (sale.price || 0), 0)
    const refundedSales = sales.filter((sale: any) => sale.refunded).length
    const disputedSales = sales.filter((sale: any) => sale.disputed).length
    const chargebackSales = sales.filter((sale: any) => sale.chargedback).length

    // Get unique products
    const uniqueProducts = [...new Set(sales.map((sale: any) => sale.product_id))]

    // Get unique customers
    const uniqueCustomers = [...new Set(sales.map((sale: any) => sale.email))]

    return {
      success: true,
      output: {
        totalSales,
        totalRevenue,
        refundedSales,
        disputedSales,
        chargebackSales,
        uniqueProducts: uniqueProducts.length,
        uniqueCustomers: uniqueCustomers.length,
        averageOrderValue: totalSales > 0 ? Math.round(totalRevenue / totalSales) : 0,
        sales: sales.map((sale: any) => ({
          id: sale.id,
          email: sale.email,
          productId: sale.product_id,
          productName: sale.product_name,
          price: sale.price,
          currency: sale.currency,
          timestamp: sale.created_at,
          refunded: sale.refunded,
          disputed: sale.disputed,
          chargedback: sale.chargedback
        }))
      },
      message: `Retrieved analytics for ${totalSales} sale${totalSales === 1 ? '' : 's'}`
    }

  } catch (error: any) {
    logger.error("Gumroad get sales analytics error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while retrieving sales analytics"
    }
  }
}
