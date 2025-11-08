import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Find a charge in Stripe by ID
 * API VERIFICATION: Uses Stripe API GET /v1/charges/:id
 * Docs: https://stripe.com/docs/api/charges/retrieve
 */
export async function stripeFindCharge(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "stripe")

    const chargeId = context.dataFlowManager.resolveVariable(config.chargeId)
    if (!chargeId) {
      throw new Error('Charge ID is required')
    }

    const response = await fetch(`https://api.stripe.com/v1/charges/${chargeId}`, {
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
            charge: null
          },
          message: `Charge ${chargeId} not found`
        }
      }
      const errorText = await response.text()
      throw new Error(`Stripe API error: ${response.status} - ${errorText}`)
    }

    const charge = await response.json()

    return {
      success: true,
      output: {
        found: true,
        charge: {
          chargeId: charge.id,
          amount: charge.amount,
          currency: charge.currency,
          status: charge.status,
          customerId: charge.customer,
          paymentIntentId: charge.payment_intent,
          refunded: charge.refunded,
          amountRefunded: charge.amount_refunded,
          created: charge.created,
          metadata: charge.metadata
        }
      },
      message: `Found charge ${charge.id}`
    }
  } catch (error: any) {
    logger.error('[Stripe Find Charge] Error:', error)
    return {
      success: false,
      output: { found: false, charge: null },
      message: error.message || 'Failed to find charge in Stripe'
    }
  }
}
