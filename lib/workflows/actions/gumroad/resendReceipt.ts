import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Resends the purchase receipt email for a Gumroad sale
 */
export async function resendGumroadReceipt(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "gumroad")
    const saleId = resolveValue(config.saleId, input)

    if (!saleId) {
      return {
        success: false,
        message: "Sale ID is required"
      }
    }

    const url = `https://api.gumroad.com/v2/sales/${encodeURIComponent(saleId)}/resend_receipt?access_token=${accessToken}`

    logger.debug('[resendGumroadReceipt] Resending receipt for sale:', { saleId })

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to resend receipt: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()

    return {
      success: true,
      output: {
        saleId: saleId,
        receiptResent: true,
        message: result.message || "Receipt resent successfully"
      },
      message: `Successfully resent receipt for sale ${saleId}`
    }

  } catch (error: any) {
    logger.error("Gumroad resend receipt error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while resending receipt"
    }
  }
}
