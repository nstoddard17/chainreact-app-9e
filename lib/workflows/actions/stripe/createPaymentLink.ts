import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Create a Payment Link in Stripe
 * API VERIFICATION: Uses Stripe API POST /v1/payment_links
 * Docs: https://stripe.com/docs/api/payment_links/create
 *
 * Creates a shareable payment link - no code required for collecting payments.
 */
export async function stripeCreatePaymentLink(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "stripe")

    // Build request body
    const body: any = {}

    // Line items (required) - array of price/quantity objects
    if (!config.line_items) {
      throw new Error('Line items are required')
    }

    const lineItems = context.dataFlowManager.resolveVariable(config.line_items)
    if (typeof lineItems === 'string') {
      try {
        body.line_items = JSON.parse(lineItems)
      } catch (e) {
        throw new Error('Line items must be a valid JSON array')
      }
    } else if (Array.isArray(lineItems)) {
      body.line_items = lineItems
    } else {
      throw new Error('Line items must be an array')
    }

    // Optional: After completion (redirect or hosted_confirmation)
    if (config.after_completion) {
      const afterCompletion = context.dataFlowManager.resolveVariable(config.after_completion)
      if (typeof afterCompletion === 'string') {
        try {
          body.after_completion = JSON.parse(afterCompletion)
        } catch (e) {
          // If not JSON, treat as type
          body.after_completion = { type: afterCompletion }
        }
      } else if (typeof afterCompletion === 'object') {
        body.after_completion = afterCompletion
      }
    }

    // Optional: Allow promotion codes
    if (config.allow_promotion_codes !== undefined) {
      const allowPromo = context.dataFlowManager.resolveVariable(config.allow_promotion_codes)
      body.allow_promotion_codes = allowPromo === true || allowPromo === 'true'
    }

    // Optional: Shipping address collection
    if (config.shipping_address_collection) {
      const shippingConfig = context.dataFlowManager.resolveVariable(config.shipping_address_collection)
      if (typeof shippingConfig === 'string') {
        try {
          body.shipping_address_collection = JSON.parse(shippingConfig)
        } catch (e) {
          logger.error('[Stripe Create Payment Link] Failed to parse shipping_address_collection', { shippingConfig })
        }
      } else if (typeof shippingConfig === 'object') {
        body.shipping_address_collection = shippingConfig
      }
    }

    // Optional: Metadata
    if (config.metadata) {
      const metadata = context.dataFlowManager.resolveVariable(config.metadata)
      if (typeof metadata === 'object') {
        body.metadata = metadata
      } else if (typeof metadata === 'string') {
        try {
          body.metadata = JSON.parse(metadata)
        } catch (e) {
          logger.error('[Stripe Create Payment Link] Failed to parse metadata', { metadata })
        }
      }
    }

    // Optional: Application fee amount (for Connect platforms)
    if (config.application_fee_amount) {
      const feeAmount = context.dataFlowManager.resolveVariable(config.application_fee_amount)
      if (feeAmount) {
        body.application_fee_amount = parseInt(feeAmount.toString())
      }
    }

    // Optional: Application fee percent (for Connect platforms)
    if (config.application_fee_percent) {
      const feePercent = context.dataFlowManager.resolveVariable(config.application_fee_percent)
      if (feePercent) {
        body.application_fee_percent = parseFloat(feePercent.toString())
      }
    }

    // Make API call to create payment link
    const response = await fetch('https://api.stripe.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(body).toString()
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Stripe API error: ${response.status} - ${errorText}`)
    }

    const paymentLink = await response.json()

    return {
      success: true,
      output: {
        paymentLinkId: paymentLink.id,
        url: paymentLink.url,
        active: paymentLink.active,
        metadata: paymentLink.metadata,
        lineItems: paymentLink.line_items?.data || []
      },
      message: `Successfully created payment link: ${paymentLink.url}`
    }
  } catch (error: any) {
    logger.error('[Stripe Create Payment Link] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create payment link in Stripe'
    }
  }
}
