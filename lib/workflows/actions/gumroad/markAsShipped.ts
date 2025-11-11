import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Marks a Gumroad sale as shipped
 */
export async function markGumroadAsShipped(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "gumroad")
    const saleId = resolveValue(config.saleId, input)
    const trackingUrl = resolveValue(config.trackingUrl, input)

    if (!saleId) {
      return {
        success: false,
        message: "Sale ID is required"
      }
    }

    const url = `https://api.gumroad.com/v2/sales/${encodeURIComponent(saleId)}/mark_as_shipped?access_token=${accessToken}`

    const requestBody: any = {}
    if (trackingUrl) {
      requestBody.tracking_url = trackingUrl
    }

    logger.debug('[markGumroadAsShipped] Marking sale as shipped:', {
      saleId,
      trackingUrl
    })

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to mark as shipped: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()

    return {
      success: true,
      output: {
        saleId: saleId,
        shipped: true,
        trackingUrl: trackingUrl || null,
        message: result.message || "Sale marked as shipped"
      },
      message: `Successfully marked sale ${saleId} as shipped`
    }

  } catch (error: any) {
    logger.error("Gumroad mark as shipped error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while marking sale as shipped"
    }
  }
}
