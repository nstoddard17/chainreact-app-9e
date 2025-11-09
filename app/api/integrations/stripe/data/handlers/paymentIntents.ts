/**
 * Stripe Payment Intents Handler
 * API VERIFICATION: Uses Stripe API GET /v1/payment_intents
 * Docs: https://stripe.com/docs/api/payment_intents/list
 */

import { StripeIntegration, StripePaymentIntent, StripeDataHandler } from '../types'
import { validateStripeIntegration, makeStripeApiRequest, parseStripeApiResponse } from '../utils'
import { logger } from '@/lib/utils/logger'

export const getStripePaymentIntents: StripeDataHandler<StripePaymentIntent> = async (
  integration: StripeIntegration,
  options: any = {}
): Promise<StripePaymentIntent[]> => {
  logger.debug('[Stripe Payment Intents] Fetching payment intents', {
    integrationId: integration.id,
    hasToken: !!integration.access_token
  })

  try {
    // Validate integration
    validateStripeIntegration(integration)

    // Build API URL with pagination
    const limit = options.limit || 100
    const params = new URLSearchParams({
      limit: limit.toString()
    })

    // Filter by customer if provided
    if (options.customer) {
      params.append('customer', options.customer)
    }

    const apiUrl = `https://api.stripe.com/v1/payment_intents?${params.toString()}`

    // Make API request
    const response = await makeStripeApiRequest(
      apiUrl,
      integration.access_token,
      'GET'
    )

    // Parse response
    const data = await parseStripeApiResponse<{ data: any[] }>(response)

    // Transform payment intents into combobox format
    const paymentIntents: StripePaymentIntent[] = data.data.map((paymentIntent) => {
      const amount = paymentIntent.amount ? (paymentIntent.amount / 100).toFixed(2) : '0.00'
      const currency = (paymentIntent.currency || 'usd').toUpperCase()
      const status = paymentIntent.status || 'unknown'
      const created = new Date(paymentIntent.created * 1000).toLocaleDateString()

      return {
        id: paymentIntent.id,
        value: paymentIntent.id,
        label: `${paymentIntent.id} - ${currency} ${amount} (${status}) - ${created}`,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        customer: paymentIntent.customer,
        created: paymentIntent.created
      }
    })

    logger.debug('[Stripe Payment Intents] Fetched successfully', {
      count: paymentIntents.length
    })

    return paymentIntents

  } catch (error: any) {
    logger.error('[Stripe Payment Intents] Error fetching payment intents:', error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Stripe authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('Stripe API rate limit exceeded. Please try again later.')
    }

    throw new Error(error.message || 'Error fetching Stripe payment intents')
  }
}
