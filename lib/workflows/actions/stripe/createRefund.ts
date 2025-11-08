import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Create a refund in Stripe
 * API VERIFICATION: Uses Stripe API POST /v1/refunds
 * Docs: https://stripe.com/docs/api/refunds/create
 *
 * Requires either charge ID OR payment_intent ID.
 * Amount is optional - if not provided, refunds the full amount.
 */
export async function stripeCreateRefund(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "stripe")

    // Resolve required fields - must have either charge or payment_intent
    const chargeId = context.dataFlowManager.resolveVariable(config.chargeId)
    const paymentIntentId = context.dataFlowManager.resolveVariable(config.paymentIntentId)

    if (!chargeId && !paymentIntentId) {
      throw new Error('Either Charge ID or Payment Intent ID is required')
    }

    // Build request body
    const body: any = {}

    if (chargeId) {
      body.charge = chargeId
    }
    if (paymentIntentId) {
      body.payment_intent = paymentIntentId
    }

    // Amount is optional - if not provided, refunds full amount
    if (config.amount) {
      const amount = context.dataFlowManager.resolveVariable(config.amount)
      if (amount) {
        body.amount = parseInt(amount.toString())
      }
    }

    // Reason is optional
    if (config.reason) {
      body.reason = context.dataFlowManager.resolveVariable(config.reason)
    }

    // Metadata is optional
    if (config.metadata) {
      const metadata = context.dataFlowManager.resolveVariable(config.metadata)
      if (typeof metadata === 'object') {
        body.metadata = metadata
      } else if (typeof metadata === 'string') {
        try {
          body.metadata = JSON.parse(metadata)
        } catch (e) {
          logger.error('[Stripe Create Refund] Failed to parse metadata JSON', { metadata })
        }
      }
    }

    // Make API call to create refund
    const response = await fetch('https://api.stripe.com/v1/refunds', {
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

    const refund = await response.json()

    return {
      success: true,
      output: {
        refundId: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status,
        charge: refund.charge,
        paymentIntent: refund.payment_intent,
        reason: refund.reason,
        receiptNumber: refund.receipt_number,
        created: refund.created,
        metadata: refund.metadata
      },
      message: `Successfully created refund ${refund.id} for ${refund.amount / 100} ${refund.currency.toUpperCase()}`
    }
  } catch (error: any) {
    logger.error('[Stripe Create Refund] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create refund in Stripe'
    }
  }
}
