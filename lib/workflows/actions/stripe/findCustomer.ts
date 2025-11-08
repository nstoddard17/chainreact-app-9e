import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Find a customer in Stripe by ID or email
 * API VERIFICATION: Uses Stripe API GET /v1/customers/:id or GET /v1/customers?email=
 * Docs: https://stripe.com/docs/api/customers/retrieve
 *       https://stripe.com/docs/api/customers/list
 */
export async function stripeFindCustomer(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "stripe")

    // Must have either customerId OR email
    const customerId = context.dataFlowManager.resolveVariable(config.customerId)
    const email = context.dataFlowManager.resolveVariable(config.email)

    if (!customerId && !email) {
      throw new Error('Either Customer ID or Email is required')
    }

    let customer = null

    // If customerId is provided, retrieve by ID (faster, direct lookup)
    if (customerId) {
      const response = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
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
              customer: null
            },
            message: `Customer ${customerId} not found`
          }
        }
        const errorText = await response.text()
        throw new Error(`Stripe API error: ${response.status} - ${errorText}`)
      }

      customer = await response.json()
    }
    // Otherwise, search by email
    else if (email) {
      const params = new URLSearchParams({ email })
      const response = await fetch(`https://api.stripe.com/v1/customers?${params.toString()}`, {
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

      if (customers.length === 0) {
        return {
          success: true,
          output: {
            found: false,
            customer: null
          },
          message: `No customer found with email ${email}`
        }
      }

      // Return first match (email should be unique in most cases)
      customer = customers[0]

      if (customers.length > 1) {
        logger.warn(`[Stripe Find Customer] Multiple customers found for email ${email}, returning first match`)
      }
    }

    return {
      success: true,
      output: {
        found: true,
        customer: {
          customerId: customer.id,
          email: customer.email,
          name: customer.name,
          phone: customer.phone,
          description: customer.description,
          created: customer.created,
          currency: customer.currency,
          balance: customer.balance,
          delinquent: customer.delinquent,
          address: customer.address,
          shipping: customer.shipping,
          tax_exempt: customer.tax_exempt,
          metadata: customer.metadata,
          livemode: customer.livemode
        }
      },
      message: `Found customer ${customer.id}`
    }
  } catch (error: any) {
    logger.error('[Stripe Find Customer] Error:', error)
    return {
      success: false,
      output: { found: false, customer: null },
      message: error.message || 'Failed to find customer in Stripe'
    }
  }
}
