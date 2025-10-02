import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

/**
 * Get customers from Stripe
 */
export async function stripeGetCustomers(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "stripe")

    // Resolve dynamic values
    const limit = context.dataFlowManager.resolveVariable(config.limit) || 100
    const email = context.dataFlowManager.resolveVariable(config.email)
    const startingAfter = context.dataFlowManager.resolveVariable(config.starting_after)

    // Build query params
    const params: any = {
      limit: Math.min(limit, 100).toString()
    }

    if (email) {
      params.email = email
    }

    if (startingAfter) {
      params.starting_after = startingAfter
    }

    const queryString = new URLSearchParams(params).toString()

    const response = await fetch(`https://api.stripe.com/v1/customers?${queryString}`, {
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
    const customers = data.data || []

    return {
      success: true,
      output: {
        customers,
        count: customers.length,
        hasMore: data.has_more || false
      },
      message: `Successfully retrieved ${customers.length} customers from Stripe`
    }
  } catch (error: any) {
    console.error('Stripe Get Customers error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to retrieve customers from Stripe'
    }
  }
}
