import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Permanently deletes a Gumroad product
 */
export async function deleteGumroadProduct(
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

    const url = `https://api.gumroad.com/v2/products/${encodeURIComponent(productId)}?access_token=${accessToken}`

    logger.debug('[deleteGumroadProduct] Deleting product:', { productId })

    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to delete product: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()

    return {
      success: true,
      output: {
        productId: productId,
        deleted: true,
        message: result.message || "Product deleted successfully"
      },
      message: `Successfully deleted product: ${productId}`
    }

  } catch (error: any) {
    logger.error("Gumroad delete product error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while deleting product"
    }
  }
}
