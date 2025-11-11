import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Verifies a Gumroad license key
 */
export async function verifyGumroadLicense(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "gumroad")
    const productId = resolveValue(config.productId, input)
    const licenseKey = resolveValue(config.licenseKey, input)
    const incrementUsesCount = resolveValue(config.incrementUsesCount, input) || false

    if (!productId || !licenseKey) {
      const missingFields = []
      if (!productId) missingFields.push("Product ID")
      if (!licenseKey) missingFields.push("License Key")

      return {
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`
      }
    }

    const url = `https://api.gumroad.com/v2/licenses/verify?access_token=${accessToken}`

    const requestBody = {
      product_id: productId,
      license_key: licenseKey,
      increment_uses_count: incrementUsesCount
    }

    logger.debug('[verifyGumroadLicense] Verifying license:', {
      productId,
      licenseKey: licenseKey.substring(0, 8) + '...', // Log only first 8 chars for security
      incrementUsesCount
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
      throw new Error(`Failed to verify license: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()

    return {
      success: result.success === true,
      output: {
        valid: result.success === true,
        uses: result.uses,
        purchaseId: result.purchase?.id,
        productId: result.purchase?.product_id,
        productName: result.purchase?.product_name,
        email: result.purchase?.email,
        saleTimestamp: result.purchase?.sale_timestamp,
        refunded: result.purchase?.refunded,
        disputed: result.purchase?.disputed,
        chargedback: result.purchase?.chargedback,
        subscriptionId: result.purchase?.subscription_id,
        variants: result.purchase?.variants,
        licenseKey: licenseKey
      },
      message: result.success === true
        ? `License key verified successfully`
        : `License key is invalid: ${result.message || 'Unknown reason'}`
    }

  } catch (error: any) {
    logger.error("Gumroad verify license error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while verifying license"
    }
  }
}
