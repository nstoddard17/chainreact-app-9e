import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Find a payment intent in Stripe by ID
 * API VERIFICATION: Uses Stripe API GET /v1/payment_intents/:id
 * Docs: https://stripe.com/docs/api/payment_intents/retrieve
 */
export async function stripeFindPaymentIntent(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "stripe")

    // Payment Intent ID is required
    const paymentIntentId = context.dataFlowManager.resolveVariable(config.paymentIntentId)
    if (!paymentIntentId) {
      throw new Error('Payment Intent ID is required')
    }

    // Retrieve payment intent by ID
    const response = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: true,
          output: {
            found: false,
            paymentIntent: null
          },
          message: `Payment Intent ${paymentIntentId} not found`
        }
      }
      const errorText = await response.text()
      throw new Error(`Stripe API error: ${response.status} - ${errorText}`)
    }

    const paymentIntent = await response.json()

    return {
      success: true,
      output: {
        found: true,
        paymentIntent: {
          paymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          status: paymentIntent.status,
          customerId: paymentIntent.customer,
          description: paymentIntent.description,
          paymentMethod: paymentIntent.payment_method,
          receiptEmail: paymentIntent.receipt_email,
          created: paymentIntent.created,
          metadata: paymentIntent.metadata,
          nextAction: paymentIntent.next_action,
          clientSecret: paymentIntent.client_secret
        }
      },
      message: `Found payment intent ${paymentIntent.id}`
    }
  } catch (error: any) {
    logger.error('[Stripe Find Payment Intent] Error:', error)
    return {
      success: false,
      output: { found: false, paymentIntent: null },
      message: error.message || 'Failed to find payment intent in Stripe'
    }
  }
}
