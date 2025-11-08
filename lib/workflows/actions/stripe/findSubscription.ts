import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Find a subscription in Stripe by ID
 * API VERIFICATION: Uses Stripe API GET /v1/subscriptions/:id
 * Docs: https://stripe.com/docs/api/subscriptions/retrieve
 */
export async function stripeFindSubscription(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "stripe")

    // Subscription ID is required
    const subscriptionId = context.dataFlowManager.resolveVariable(config.subscriptionId)
    if (!subscriptionId) {
      throw new Error('Subscription ID is required')
    }

    // Retrieve subscription by ID
    const response = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
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
            subscription: null
          },
          message: `Subscription ${subscriptionId} not found`
        }
      }
      const errorText = await response.text()
      throw new Error(`Stripe API error: ${response.status} - ${errorText}`)
    }

    const subscription = await response.json()

    return {
      success: true,
      output: {
        found: true,
        subscription: {
          subscriptionId: subscription.id,
          customerId: subscription.customer,
          status: subscription.status,
          currentPeriodStart: subscription.current_period_start,
          currentPeriodEnd: subscription.current_period_end,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          canceledAt: subscription.canceled_at,
          trialStart: subscription.trial_start,
          trialEnd: subscription.trial_end,
          items: subscription.items?.data || [],
          metadata: subscription.metadata,
          created: subscription.created
        }
      },
      message: `Found subscription ${subscription.id}`
    }
  } catch (error: any) {
    logger.error('[Stripe Find Subscription] Error:', error)
    return {
      success: false,
      output: { found: false, subscription: null },
      message: error.message || 'Failed to find subscription in Stripe'
    }
  }
}
