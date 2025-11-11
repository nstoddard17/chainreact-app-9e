import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Refunds a Gumroad sale
 */
export async function refundGumroadSale(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "gumroad")
    const saleId = resolveValue(config.saleId, input)
    const amountCents = resolveValue(config.amountCents, input)

    if (!saleId) {
      return {
        success: false,
        message: "Sale ID is required"
      }
    }

    const url = `https://api.gumroad.com/v2/sales/${encodeURIComponent(saleId)}/refund?access_token=${accessToken}`

    const requestBody: any = {}
    if (amountCents) {
      requestBody.amount_cents = parseInt(amountCents)
    }

    logger.debug('[refundGumroadSale] Refunding sale:', {
      saleId,
      amountCents
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
      throw new Error(`Failed to refund sale: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()

    return {
      success: true,
      output: {
        saleId: saleId,
        refunded: true,
        amountCents: amountCents || null,
        message: result.message || "Sale refunded successfully"
      },
      message: amountCents
        ? `Successfully refunded $${(amountCents / 100).toFixed(2)} for sale ${saleId}`
        : `Successfully refunded sale ${saleId}`
    }

  } catch (error: any) {
    logger.error("Gumroad refund sale error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while refunding sale"
    }
  }
}
