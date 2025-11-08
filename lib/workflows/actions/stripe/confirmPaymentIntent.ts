import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Confirm a payment intent in Stripe
 * API VERIFICATION: Uses Stripe API POST /v1/payment_intents/:id/confirm
 * Docs: https://stripe.com/docs/api/payment_intents/confirm
 */
export async function stripeConfirmPaymentIntent(
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

    if (config.payment_method) {
      body.payment_method = context.dataFlowManager.resolveVariable(config.payment_method)
    }
    if (config.receipt_email) {
      body.receipt_email = context.dataFlowManager.resolveVariable(config.receipt_email)
    }
    if (config.return_url) {
      body.return_url = context.dataFlowManager.resolveVariable(config.return_url)
    }

    const response = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}/confirm`, {
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
        currency: paymentIntent.currency,
        clientSecret: paymentIntent.client_secret,
        nextAction: paymentIntent.next_action
      },
      message: `Successfully confirmed payment intent ${paymentIntent.id}`
    }
  } catch (error: any) {
    logger.error('[Stripe Confirm Payment Intent] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to confirm payment intent in Stripe'
    }
  }
}
