import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Get payment intents from Stripe
 */
export async function stripeGetPayments(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "stripe")

    // Resolve dynamic values
    const limit = context.dataFlowManager.resolveVariable(config.limit) || 100
    const customerId = context.dataFlowManager.resolveVariable(config.customer)
    const status = context.dataFlowManager.resolveVariable(config.status)
    const startingAfter = context.dataFlowManager.resolveVariable(config.starting_after)

    // Build query params
    const params: any = {
      limit: Math.min(limit, 100).toString()
    }

    if (customerId) {
      params.customer = customerId
    }

    if (status) {
      params['status'] = status
    }

    if (startingAfter) {
      params.starting_after = startingAfter
    }

    const queryString = new URLSearchParams(params).toString()

    const response = await fetch(`https://api.stripe.com/v1/payment_intents?${queryString}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Stripe API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const payments = data.data || []

    return {
      success: true,
      output: {
        payments,
        count: payments.length,
        hasMore: data.has_more || false
      },
      message: `Successfully retrieved ${payments.length} payments from Stripe`
    }
  } catch (error: any) {
    logger.error('Stripe Get Payments error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to retrieve payments from Stripe'
    }
  }
}
