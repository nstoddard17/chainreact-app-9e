import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Create a new payment intent in Stripe
 * API VERIFICATION: Uses Stripe API POST /v1/payment_intents
 * Docs: https://stripe.com/docs/api/payment_intents/create
 */
export async function stripeCreatePaymentIntent(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "stripe")

    // Resolve required fields
    const amount = context.dataFlowManager.resolveVariable(config.amount)
    const currency = context.dataFlowManager.resolveVariable(config.currency)

    if (!amount || !currency) {
      throw new Error('Amount and currency are required to create a payment intent')
    }

    // Build request body
    const body: any = {
      amount: parseInt(amount),
      currency: currency.toLowerCase()
    }

    // Optional customer ID
    if (config.customerId) {
      body.customer = context.dataFlowManager.resolveVariable(config.customerId)
    }

    // Optional description
    if (config.description) {
      body.description = context.dataFlowManager.resolveVariable(config.description)
    }

    // Optional metadata
    if (config.metadata) {
      const metadata = context.dataFlowManager.resolveVariable(config.metadata)
      if (typeof metadata === 'object') {
        body.metadata = metadata
      } else if (typeof metadata === 'string') {
        try {
          body.metadata = JSON.parse(metadata)
        } catch (e) {
          logger.error('[Stripe Create Payment Intent] Failed to parse metadata JSON', { metadata })
        }
      }
    }

    // Make API call to create payment intent
    const response = await fetch('https://api.stripe.com/v1/payment_intents', {
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
        clientSecret: paymentIntent.client_secret,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        customerId: paymentIntent.customer,
        description: paymentIntent.description,
        created: paymentIntent.created,
        metadata: paymentIntent.metadata,
        nextAction: paymentIntent.next_action
      },
      message: `Successfully created payment intent ${paymentIntent.id}`
    }
  } catch (error: any) {
    logger.error('[Stripe Create Payment Intent] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create payment intent in Stripe'
    }
  }
}
