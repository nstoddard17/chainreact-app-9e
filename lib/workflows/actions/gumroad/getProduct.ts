import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Retrieves detailed information about a specific Gumroad product
 */
export async function getGumroadProduct(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "gumroad")
    const productId = resolveValue(config.productId, input)

    if (!productId) {
      return {
        success: false,
        message: "Product ID is required"
      }
    }

    // Gumroad API uses query parameter authentication
    const url = `https://api.gumroad.com/v2/products/${encodeURIComponent(productId)}?access_token=${accessToken}`

    logger.debug('[getGumroadProduct] Fetching product:', { productId })

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to get product: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()
    const product = result.product

    if (!product) {
      return {
        success: false,
        message: "Product not found"
      }
    }

    return {
      success: true,
      output: {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price_cents,
        currency: product.currency,
        url: product.short_url || product.url,
        published: product.published,
        customizable_price: product.customizable_price,
        sales_count: product.sales_count,
        variants: product.variants || [],
        custom_fields: product.custom_fields || [],
        custom_permalink: product.custom_permalink,
        custom_receipt: product.custom_receipt,
        custom_summary: product.custom_summary,
        preview_url: product.preview_url,
        thumbnail_url: product.thumbnail_url,
        formatted_price: product.formatted_price
      },
      message: `Successfully retrieved product: ${product.name}`
    }

  } catch (error: any) {
    logger.error("Gumroad get product error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while retrieving product"
    }
  }
}
