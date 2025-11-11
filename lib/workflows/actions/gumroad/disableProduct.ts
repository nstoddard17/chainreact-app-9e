import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Disables (unpublishes) a Gumroad product
 */
export async function disableGumroadProduct(
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

    const url = `https://api.gumroad.com/v2/products/${encodeURIComponent(productId)}/disable?access_token=${accessToken}`

    logger.debug('[disableGumroadProduct] Disabling product:', { productId })

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to disable product: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()
    const product = result.product

    return {
      success: true,
      output: {
        id: product.id,
        name: product.name,
        published: product.published,
        url: product.short_url || product.url
      },
      message: `Successfully disabled product: ${product.name}`
    }

  } catch (error: any) {
    logger.error("Gumroad disable product error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while disabling product"
    }
  }
}
