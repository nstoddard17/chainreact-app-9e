import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Disables a Gumroad license key
 */
export async function disableGumroadLicense(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "gumroad")
    const productId = resolveValue(config.productId, input)
    const licenseKey = resolveValue(config.licenseKey, input)

    if (!productId || !licenseKey) {
      const missingFields = []
      if (!productId) missingFields.push("Product ID")
      if (!licenseKey) missingFields.push("License Key")

      return {
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`
      }
    }

    const url = `https://api.gumroad.com/v2/licenses/disable?access_token=${accessToken}`

    const requestBody = {
      product_id: productId,
      license_key: licenseKey
    }

    logger.debug('[disableGumroadLicense] Disabling license:', {
      productId,
      licenseKey: licenseKey.substring(0, 8) + '...' // Log only first 8 chars for security
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
      throw new Error(`Failed to disable license: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()

    return {
      success: result.success === true,
      output: {
        disabled: result.success === true,
        productId: productId,
        licenseKey: licenseKey,
        message: result.message || "License disabled successfully"
      },
      message: result.success === true
        ? `Successfully disabled license key`
        : `Failed to disable license: ${result.message || 'Unknown reason'}`
    }

  } catch (error: any) {
    logger.error("Gumroad disable license error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while disabling license"
    }
  }
}
