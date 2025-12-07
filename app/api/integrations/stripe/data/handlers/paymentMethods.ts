/**
 * Stripe Payment Methods Handler
 * API VERIFICATION: Uses Stripe API GET /v1/payment_methods
 * Docs: https://stripe.com/docs/api/payment_methods/list
 */

import { StripeIntegration, StripeDataHandler } from '../types'
import { validateStripeIntegration, makeStripeApiRequest, parseStripeApiResponse } from '../utils'
import { logger } from '@/lib/utils/logger'

export interface StripePaymentMethod {
  id: string
  value: string
  label: string
  type: string
  card?: {
    brand: string
    last4: string
    exp_month: number
    exp_year: number
  }
  us_bank_account?: {
    account_type: string
    bank_name: string
    last4: string
  }
}

export const getStripePaymentMethods: StripeDataHandler<StripePaymentMethod> = async (
  integration: StripeIntegration,
  options: any = {}
): Promise<StripePaymentMethod[]> => {
  logger.info('[Stripe Payment Methods] Starting fetch', {
    integrationId: integration.id,
    hasToken: !!integration.access_token,
    options,
    timestamp: new Date().toISOString()
  })

  try {
    // Validate integration
    validateStripeIntegration(integration)

    // Build API URL with pagination
    const limit = options.limit || 100
    const params = new URLSearchParams({
      limit: limit.toString(),
      type: 'card' // Default to card payment methods
    })

    // Add customer filter if provided
    if (options.customer) {
      params.append('customer', options.customer)
    }

    const apiUrl = `https://api.stripe.com/v1/payment_methods?${params.toString()}`
    logger.info('[Stripe Payment Methods] Making API request', {
      method: 'GET',
      limit,
      hasCustomerFilter: !!options.customer
    })

    // Make API request
    const response = await makeStripeApiRequest(
      apiUrl,
      integration.access_token,
      'GET'
    )

    logger.info('[Stripe Payment Methods] API response received', {
      status: response.status,
      ok: response.ok
    })

    // Parse response
    const data = await parseStripeApiResponse<{ data: any[] }>(response)
    logger.info('[Stripe Payment Methods] Response parsed', {
      paymentMethodCount: data.data?.length || 0
    })

    // Transform payment methods into combobox format
    const paymentMethods: StripePaymentMethod[] = data.data.map((pm) => {
      let label = pm.id

      // Format label based on payment method type
      if (pm.type === 'card' && pm.card) {
        label = `${pm.card.brand.toUpperCase()} •••• ${pm.card.last4} (${pm.card.exp_month}/${pm.card.exp_year})`
      } else if (pm.type === 'us_bank_account' && pm.us_bank_account) {
        label = `${pm.us_bank_account.bank_name || 'Bank'} •••• ${pm.us_bank_account.last4} (${pm.us_bank_account.account_type})`
      }

      return {
        id: pm.id,
        value: pm.id,
        label,
        type: pm.type,
        card: pm.card,
        us_bank_account: pm.us_bank_account
      }
    })

    logger.info('[Stripe Payment Methods] Transformation complete', {
      count: paymentMethods.length
    })

    return paymentMethods

  } catch (error: any) {
    logger.error('[Stripe Payment Methods] Error fetching payment methods', {
      error: error.message
    })

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Stripe authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('Stripe API rate limit exceeded. Please try again later.')
    }

    throw new Error(error.message || 'Error fetching Stripe payment methods')
  }
}
