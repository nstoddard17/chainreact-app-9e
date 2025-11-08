import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Cancel a subscription in Stripe
 * API VERIFICATION: Uses Stripe API DELETE /v1/subscriptions/:id
 * Docs: https://stripe.com/docs/api/subscriptions/cancel
 */
export async function stripeCancelSubscription(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "stripe")

    // Resolve required subscriptionId
    const subscriptionId = context.dataFlowManager.resolveVariable(config.subscriptionId)
    if (!subscriptionId) {
      throw new Error('Subscription ID is required')
    }

    // Build query parameters for cancellation options
    const params: any = {}

    // Cancel at period end (default false = immediate cancellation)
    if (config.at_period_end !== undefined) {
      const atPeriodEnd = context.dataFlowManager.resolveVariable(config.at_period_end)
      if (atPeriodEnd === true || atPeriodEnd === 'true') {
        params.cancel_at_period_end = 'true'
      }
    }

    // Invoice now (create final invoice immediately)
    if (config.invoice_now !== undefined) {
      const invoiceNow = context.dataFlowManager.resolveVariable(config.invoice_now)
      if (invoiceNow === true || invoiceNow === 'true') {
        params.invoice_now = 'true'
      }
    }

    // Prorate (calculate prorated amounts for partial period)
    if (config.prorate !== undefined) {
      const prorate = context.dataFlowManager.resolveVariable(config.prorate)
      if (prorate === true || prorate === 'true') {
        params.prorate = 'true'
      }
    }

    const queryString = Object.keys(params).length > 0
      ? '?' + new URLSearchParams(params).toString()
      : ''

    // Make API call to cancel subscription
    const response = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}${queryString}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Stripe API error: ${response.status} - ${errorText}`)
    }

    const subscription = await response.json()

    return {
      success: true,
      output: {
        subscriptionId: subscription.id,
        status: subscription.status,
        canceledAt: subscription.canceled_at,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        currentPeriodEnd: subscription.current_period_end,
        customerId: subscription.customer,
        endedAt: subscription.ended_at
      },
      message: `Successfully canceled subscription ${subscription.id}`
    }
  } catch (error: any) {
    logger.error('[Stripe Cancel Subscription] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to cancel subscription in Stripe'
    }
  }
}
