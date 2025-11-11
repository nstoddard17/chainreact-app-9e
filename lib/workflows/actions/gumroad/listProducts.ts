import { getDecryptedAccessToken, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Lists all products in the Gumroad account
 */
export async function listGumroadProducts(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "gumroad")

    const url = `https://api.gumroad.com/v2/products?access_token=${accessToken}`

    logger.debug('[listGumroadProducts] Fetching all products')

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to list products: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()
    const products = result.products || []

    // Transform products to match output schema
    const transformedProducts = products.map((product: any) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price_cents,
      currency: product.currency,
      url: product.short_url || product.url,
      published: product.published,
      customizable_price: product.customizable_price,
      sales_count: product.sales_count,
      thumbnail_url: product.thumbnail_url,
      formatted_price: product.formatted_price
    }))

    return {
      success: true,
      output: {
        products: transformedProducts,
        count: transformedProducts.length
      },
      message: `Successfully retrieved ${transformedProducts.length} product${transformedProducts.length === 1 ? '' : 's'}`
    }

  } catch (error: any) {
    logger.error("Gumroad list products error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while listing products"
    }
  }
}
