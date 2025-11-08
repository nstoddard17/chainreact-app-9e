import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Update an existing subscription in Stripe
 * API VERIFICATION: Uses Stripe API POST /v1/subscriptions/:id
 * Docs: https://stripe.com/docs/api/subscriptions/update
 */
export async function stripeUpdateSubscription(
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

    // Build request body
    const body: any = {}

    // Price ID (change plan)
    if (config.priceId) {
      const priceId = context.dataFlowManager.resolveVariable(config.priceId)
      if (priceId) {
        // Update items array with new price
        body.items = [{
          id: subscriptionId, // Will be replaced by Stripe with actual item ID
          price: priceId
        }]
      }
    }

    // Quantity
    if (config.quantity) {
      const quantity = context.dataFlowManager.resolveVariable(config.quantity)
      if (quantity) {
        body.quantity = parseInt(quantity.toString())
      }
    }

    // Trial end (timestamp or 'now')
    if (config.trial_end) {
      const trialEnd = context.dataFlowManager.resolveVariable(config.trial_end)
      if (trialEnd) {
        body.trial_end = trialEnd === 'now' ? 'now' : parseInt(trialEnd.toString())
      }
    }

    // Cancel at period end
    if (config.cancel_at_period_end !== undefined) {
      const cancelAtPeriodEnd = context.dataFlowManager.resolveVariable(config.cancel_at_period_end)
      body.cancel_at_period_end = cancelAtPeriodEnd === true || cancelAtPeriodEnd === 'true'
    }

    // Proration behavior
    if (config.proration_behavior) {
      body.proration_behavior = context.dataFlowManager.resolveVariable(config.proration_behavior)
    }

    // Default payment method
    if (config.default_payment_method) {
      body.default_payment_method = context.dataFlowManager.resolveVariable(config.default_payment_method)
    }

    // Metadata
    if (config.metadata) {
      const metadata = context.dataFlowManager.resolveVariable(config.metadata)
      if (typeof metadata === 'object') {
        body.metadata = metadata
      } else if (typeof metadata === 'string') {
        try {
          body.metadata = JSON.parse(metadata)
        } catch (e) {
          logger.error('[Stripe Update Subscription] Failed to parse metadata JSON', { metadata })
        }
      }
    }

    // Collection method
    if (config.collection_method) {
      body.collection_method = context.dataFlowManager.resolveVariable(config.collection_method)
    }

    // Days until due (for send_invoice collection method)
    if (config.days_until_due) {
      const daysUntilDue = context.dataFlowManager.resolveVariable(config.days_until_due)
      if (daysUntilDue) {
        body.days_until_due = parseInt(daysUntilDue.toString())
      }
    }

    // Make API call to update subscription
    const response = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
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

    const subscription = await response.json()

    return {
      success: true,
      output: {
        subscriptionId: subscription.id,
        customerId: subscription.customer,
        status: subscription.status,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        trialStart: subscription.trial_start,
        trialEnd: subscription.trial_end,
        items: subscription.items?.data || [],
        metadata: subscription.metadata
      },
      message: `Successfully updated subscription ${subscription.id}`
    }
  } catch (error: any) {
    logger.error('[Stripe Update Subscription] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to update subscription in Stripe'
    }
  }
}
