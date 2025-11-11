import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Creates a variant category for a Gumroad product
 */
export async function createGumroadVariantCategory(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "gumroad")
    const productId = resolveValue(config.productId, input)
    const title = resolveValue(config.title, input)

    if (!productId || !title) {
      const missingFields = []
      if (!productId) missingFields.push("Product ID")
      if (!title) missingFields.push("Title")

      return {
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`
      }
    }

    const url = `https://api.gumroad.com/v2/products/${encodeURIComponent(productId)}/variant_categories?access_token=${accessToken}`

    const requestBody = {
      title: title
    }

    logger.debug('[createGumroadVariantCategory] Creating variant category:', {
      productId,
      title
    })

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to create variant category: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()
    const variantCategory = result.variant_category

    return {
      success: true,
      output: {
        id: variantCategory.id,
        title: variantCategory.title,
        productId: productId,
        variants: variantCategory.variants || []
      },
      message: `Successfully created variant category: ${variantCategory.title}`
    }

  } catch (error: any) {
    logger.error("Gumroad create variant category error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while creating variant category"
    }
  }
}
