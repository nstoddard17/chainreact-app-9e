import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Creates a discount offer code for a Gumroad product
 */
export async function createGumroadOfferCode(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "gumroad")
    const productId = resolveValue(config.productId, input)
    const name = resolveValue(config.name, input)
    const discountType = resolveValue(config.discountType, input)
    const amountCents = resolveValue(config.amountCents, input)
    const percentOff = resolveValue(config.percentOff, input)
    const maxPurchaseCount = resolveValue(config.maxPurchaseCount, input)
    const universal = resolveValue(config.universal, input)

    if (!productId || !name || !discountType) {
      const missingFields = []
      if (!productId) missingFields.push("Product ID")
      if (!name) missingFields.push("Offer Code Name")
      if (!discountType) missingFields.push("Discount Type")

      return {
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`
      }
    }

    // Validate discount values based on type
    if (discountType === 'amount' && !amountCents) {
      return {
        success: false,
        message: "Discount Amount is required when using 'Fixed Amount Off' type"
      }
    }

    if (discountType === 'percent' && !percentOff) {
      return {
        success: false,
        message: "Percent Off is required when using 'Percentage Off' type"
      }
    }

    const url = `https://api.gumroad.com/v2/products/${encodeURIComponent(productId)}/offer_codes?access_token=${accessToken}`

    const requestBody: any = {
      name: name,
      offer_type: discountType
    }

    if (discountType === 'amount') {
      requestBody.amount_cents = parseInt(amountCents)
    } else if (discountType === 'percent') {
      requestBody.percent_off = parseInt(percentOff)
    }

    if (maxPurchaseCount) {
      requestBody.max_purchase_count = parseInt(maxPurchaseCount)
    }

    if (universal !== undefined) {
      requestBody.universal = universal
    }

    logger.debug('[createGumroadOfferCode] Creating offer code:', {
      productId,
      name,
      discountType
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
      throw new Error(`Failed to create offer code: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()
    const offerCode = result.offer_code

    return {
      success: true,
      output: {
        id: offerCode.id,
        name: offerCode.name,
        productId: productId,
        offer_type: offerCode.offer_type,
        amount_cents: offerCode.amount_cents,
        percent_off: offerCode.percent_off,
        max_purchase_count: offerCode.max_purchase_count,
        universal: offerCode.universal,
        url: offerCode.url
      },
      message: `Successfully created offer code: ${offerCode.name}`
    }

  } catch (error: any) {
    logger.error("Gumroad create offer code error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while creating offer code"
    }
  }
}
