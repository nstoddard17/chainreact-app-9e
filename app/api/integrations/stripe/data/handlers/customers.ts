/**
 * Stripe Customers Handler
 * API VERIFICATION: Uses Stripe API GET /v1/customers
 * Docs: https://stripe.com/docs/api/customers/list
 */

import { StripeIntegration, StripeCustomer, StripeDataHandler } from '../types'
import { validateStripeIntegration, makeStripeApiRequest, parseStripeApiResponse } from '../utils'
import { logger } from '@/lib/utils/logger'

export const getStripeCustomers: StripeDataHandler<StripeCustomer> = async (
  integration: StripeIntegration,
  options: any = {}
): Promise<StripeCustomer[]> => {
  logger.debug('[Stripe Customers] Fetching customers', {
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

    // Add search query if provided
    if (options.search) {
      params.append('email', options.search)
    }

    const apiUrl = `https://api.stripe.com/v1/customers?${params.toString()}`

    // Make API request
    const response = await makeStripeApiRequest(
      apiUrl,
      integration.access_token,
      'GET'
    )

    // Parse response
    const data = await parseStripeApiResponse<{ data: any[] }>(response)

    // Transform customers into combobox format
    const customers: StripeCustomer[] = data.data.map((customer) => ({
      id: customer.id,
      value: customer.id,
      label: customer.name
        ? `${customer.name} (${customer.email || customer.id})`
        : customer.email || customer.id,
      email: customer.email,
      name: customer.name,
      description: customer.description,
      metadata: customer.metadata
    }))

    logger.debug('[Stripe Customers] Fetched successfully', {
      count: customers.length
    })

    return customers

  } catch (error: any) {
    logger.error('[Stripe Customers] Error fetching customers:', error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Stripe authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('Stripe API rate limit exceeded. Please try again later.')
    }

    throw new Error(error.message || 'Error fetching Stripe customers')
  }
}
