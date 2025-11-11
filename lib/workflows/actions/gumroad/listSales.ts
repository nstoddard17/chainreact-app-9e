import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Lists sales from Gumroad with filtering options
 */
export async function listGumroadSales(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "gumroad")
    const productId = resolveValue(config.productId, input)
    const email = resolveValue(config.email, input)
    const after = resolveValue(config.after, input)
    const before = resolveValue(config.before, input)
    const orderId = resolveValue(config.orderId, input)
    const statusFilters = resolveValue(config.statusFilters, input)
    const pageKey = resolveValue(config.pageKey, input)
    const pageSize = resolveValue(config.pageSize, input) || 10

    // Build query parameters
    const params = new URLSearchParams({
      access_token: accessToken
    })

    if (productId) params.append('product_id', productId)
    if (email) params.append('email', email)
    if (after) params.append('after', after)
    if (before) params.append('before', before)
    if (orderId) params.append('order_id', orderId)
    if (pageKey) params.append('page_key', pageKey)
    params.append('page_size', pageSize.toString())

    const url = `https://api.gumroad.com/v2/sales?${params.toString()}`

    logger.debug('[listGumroadSales] Fetching sales:', {
      productId,
      email,
      after,
      before,
      orderId,
      statusFilters,
      pageKey,
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
      throw new Error(`Failed to list sales: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()
    let sales = result.sales || []

    // Apply status filters if provided
    if (statusFilters && Array.isArray(statusFilters) && statusFilters.length > 0) {
      sales = sales.filter((sale: any) => {
        return statusFilters.some((filter: string) => {
          switch (filter) {
            case 'disputed':
              return sale.disputed
            case 'dispute_won':
              return sale.dispute_won
            case 'chargedback':
              return sale.chargedback
            case 'shipped':
              return sale.shipped
            case 'refunded':
              return sale.refunded
            case 'partially_refunded':
              return sale.partially_refunded
            default:
              return false
          }
        })
      })
    }

    // Transform sales to match output schema
    const transformedSales = sales.map((sale: any) => ({
      id: sale.id,
      email: sale.email,
      fullName: sale.full_name,
      purchaseEmail: sale.purchase_email,
      productId: sale.product_id,
      productName: sale.product_name,
      price: sale.price,
      currency: sale.currency,
      quantity: sale.quantity,
      saleTimestamp: sale.created_at,
      orderId: sale.order_id,
      refunded: sale.refunded,
      partiallyRefunded: sale.partially_refunded,
      disputed: sale.disputed,
      disputeWon: sale.dispute_won,
      chargedback: sale.chargedback,
      shipped: sale.shipped,
      variants: sale.variants,
      customFields: sale.custom_fields,
      subscriptionId: sale.subscription_id
    }))

    return {
      success: true,
      output: {
        sales: transformedSales,
        count: transformedSales.length,
        nextPageKey: result.next_page_key || null
      },
      message: `Successfully retrieved ${transformedSales.length} sale${transformedSales.length === 1 ? '' : 's'}`
    }

  } catch (error: any) {
    logger.error("Gumroad list sales error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while listing sales"
    }
  }
}
