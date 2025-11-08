/**
 * Stripe Subscriptions Handler
 * API VERIFICATION: Uses Stripe API GET /v1/subscriptions
 * Docs: https://stripe.com/docs/api/subscriptions/list
 */

import { StripeIntegration, StripeSubscription, StripeDataHandler } from '../types'
import { validateStripeIntegration, makeStripeApiRequest, parseStripeApiResponse } from '../utils'
import { logger } from '@/lib/utils/logger'

export const getStripeSubscriptions: StripeDataHandler<StripeSubscription> = async (
  integration: StripeIntegration,
  options: any = {}
): Promise<StripeSubscription[]> => {
  logger.debug('[Stripe Subscriptions] Fetching subscriptions', {
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

    // Filter by status if provided
    if (options.status) {
      params.append('status', options.status)
    }

    // Filter by customer if provided
    if (options.customer) {
      params.append('customer', options.customer)
    }

    const apiUrl = `https://api.stripe.com/v1/subscriptions?${params.toString()}`

    // Make API request
    const response = await makeStripeApiRequest(
      apiUrl,
      integration.access_token,
      'GET'
    )

    // Parse response
    const data = await parseStripeApiResponse<{ data: any[] }>(response)

    // Transform subscriptions into combobox format
    const subscriptions: StripeSubscription[] = data.data.map((subscription) => {
      const periodEnd = new Date(subscription.current_period_end * 1000).toLocaleDateString()

      return {
        id: subscription.id,
        value: subscription.id,
        label: `${subscription.id} - ${subscription.status} (ends ${periodEnd})`,
        customer: subscription.customer,
        status: subscription.status,
        current_period_end: subscription.current_period_end
      }
    })

    logger.debug('[Stripe Subscriptions] Fetched successfully', {
      count: subscriptions.length
    })

    return subscriptions

  } catch (error: any) {
    logger.error('[Stripe Subscriptions] Error fetching subscriptions:', error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Stripe authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('Stripe API rate limit exceeded. Please try again later.')
    }

    throw new Error(error.message || 'Error fetching Stripe subscriptions')
  }
}
