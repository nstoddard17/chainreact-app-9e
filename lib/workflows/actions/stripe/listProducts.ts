import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * List products from Stripe
 * API VERIFICATION: Uses Stripe API GET /v1/products
 * Docs: https://stripe.com/docs/api/products/list
 */
export async function stripeListProducts(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "stripe")

    const params: any = {}

    const limit = context.dataFlowManager.resolveVariable(config.limit) || 100
    params.limit = Math.min(limit, 100).toString()

    if (config.active !== undefined) {
      const active = context.dataFlowManager.resolveVariable(config.active)
      params.active = active === true || active === 'true'
    }

    if (config.starting_after) {
      params.starting_after = context.dataFlowManager.resolveVariable(config.starting_after)
    }

    const queryString = new URLSearchParams(params).toString()

    const response = await fetch(`https://api.stripe.com/v1/products?${queryString}`, {
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
    const products = data.data || []

    return {
      success: true,
      output: {
        products,
        count: products.length,
        hasMore: data.has_more || false
      },
      message: `Successfully retrieved ${products.length} products from Stripe`
    }
  } catch (error: any) {
    logger.error('[Stripe List Products] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to list products from Stripe'
    }
  }
}
