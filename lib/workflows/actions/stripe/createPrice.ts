import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Create a price in Stripe
 * API VERIFICATION: Uses Stripe API POST /v1/prices
 * Docs: https://stripe.com/docs/api/prices/create
 */
export async function stripeCreatePrice(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "stripe")

    // Required: Product ID
    const productId = context.dataFlowManager.resolveVariable(config.productId)
    if (!productId) {
      throw new Error('Product ID is required')
    }

    // Required: Currency
    const currency = context.dataFlowManager.resolveVariable(config.currency)
    if (!currency) {
      throw new Error('Currency is required')
    }

    const body: any = {
      product: productId,
      currency: currency.toLowerCase()
    }

    // Unit amount (required for per_unit billing)
    if (config.unit_amount) {
      const unitAmount = context.dataFlowManager.resolveVariable(config.unit_amount)
      if (unitAmount) {
        body.unit_amount = parseInt(unitAmount.toString())
      }
    }

    // Billing scheme
    if (config.billing_scheme) {
      body.billing_scheme = context.dataFlowManager.resolveVariable(config.billing_scheme)
    }

    // Recurring (for subscriptions)
    if (config.recurring_interval) {
      const interval = context.dataFlowManager.resolveVariable(config.recurring_interval)
      const intervalCount = config.recurring_interval_count
        ? parseInt(context.dataFlowManager.resolveVariable(config.recurring_interval_count).toString())
        : 1

      body.recurring = {
        interval,
        interval_count: intervalCount
      }
    }

    // Optional: Nickname
    if (config.nickname) {
      body.nickname = context.dataFlowManager.resolveVariable(config.nickname)
    }

    // Optional: Active status
    if (config.active !== undefined) {
      const active = context.dataFlowManager.resolveVariable(config.active)
      body.active = active === true || active === 'true'
    }

    // Optional: Metadata
    if (config.metadata) {
      const metadata = context.dataFlowManager.resolveVariable(config.metadata)
      if (typeof metadata === 'object') {
        body.metadata = metadata
      } else if (typeof metadata === 'string') {
        try {
          body.metadata = JSON.parse(metadata)
        } catch (e) {
          logger.error('[Stripe Create Price] Failed to parse metadata', { metadata })
        }
      }
    }

    // Optional: Lookup key
    if (config.lookup_key) {
      body.lookup_key = context.dataFlowManager.resolveVariable(config.lookup_key)
    }

    // Make API call to create price
    const response = await fetch('https://api.stripe.com/v1/prices', {
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

    const price = await response.json()

    return {
      success: true,
      output: {
        priceId: price.id,
        productId: price.product,
        currency: price.currency,
        unitAmount: price.unit_amount,
        recurring: price.recurring,
        active: price.active,
        nickname: price.nickname,
        metadata: price.metadata,
        created: price.created
      },
      message: `Successfully created price ${price.id}`
    }
  } catch (error: any) {
    logger.error('[Stripe Create Price] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create price in Stripe'
    }
  }
}
