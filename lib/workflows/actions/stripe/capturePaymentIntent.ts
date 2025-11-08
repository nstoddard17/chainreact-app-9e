import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Capture a payment intent in Stripe (for two-step auth/capture flows)
 * API VERIFICATION: Uses Stripe API POST /v1/payment_intents/:id/capture
 * Docs: https://stripe.com/docs/api/payment_intents/capture
 */
export async function stripeCapturePaymentIntent(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "stripe")

    const paymentIntentId = context.dataFlowManager.resolveVariable(config.paymentIntentId)
    if (!paymentIntentId) {
      throw new Error('Payment Intent ID is required')
    }

    const body: any = {}

    if (config.amount_to_capture) {
      const amount = context.dataFlowManager.resolveVariable(config.amount_to_capture)
      if (amount) {
        body.amount_to_capture = parseInt(amount.toString())
      }
    }

    const response = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}/capture`, {
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

    const paymentIntent = await response.json()

    return {
      success: true,
      output: {
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        amountCaptured: paymentIntent.amount_captured,
        currency: paymentIntent.currency
      },
      message: `Successfully captured payment intent ${paymentIntent.id}`
    }
  } catch (error: any) {
    logger.error('[Stripe Capture Payment Intent] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to capture payment intent in Stripe'
    }
  }
}
