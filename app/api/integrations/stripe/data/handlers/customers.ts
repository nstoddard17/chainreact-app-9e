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
  logger.info('[Stripe Customers] Starting fetch', {
    integrationId: integration.id,
    hasToken: !!integration.access_token,
    tokenLength: integration.access_token?.length,
    options,
    timestamp: new Date().toISOString()
  })

  try {
    // Validate integration
    logger.info('[Stripe Customers] Validating integration', {
      integrationId: integration.id,
      provider: integration.provider,
      status: integration.status
    })
    validateStripeIntegration(integration)
    logger.info('[Stripe Customers] Integration validated successfully', {
      integrationId: integration.id
    })

    // Build API URL with pagination
    const limit = options.limit || 100
    const params = new URLSearchParams({
      limit: limit.toString()
    })

    // Add search query if provided
    if (options.search) {
      logger.info('[Stripe Customers] Adding search filter', { search: options.search })
      params.append('email', options.search)
    }

    const apiUrl = `https://api.stripe.com/v1/customers?${params.toString()}`
    logger.info('[Stripe Customers] Making API request', {
      apiUrl,
      method: 'GET',
      limit,
      hasSearchFilter: !!options.search
    })

    // Make API request
    const response = await makeStripeApiRequest(
      apiUrl,
      integration.access_token,
      'GET'
    )

    logger.info('[Stripe Customers] API response received', {
      status: response.status,
      ok: response.ok,
      statusText: response.statusText
    })

    // Parse response
    const data = await parseStripeApiResponse<{ data: any[] }>(response)
    logger.info('[Stripe Customers] Response parsed', {
      customerCount: data.data?.length || 0,
      hasData: !!data.data,
      dataType: typeof data.data,
      isArray: Array.isArray(data.data)
    })

    // Transform customers into combobox format
    logger.info('[Stripe Customers] Transforming customers', {
      rawCustomerCount: data.data?.length || 0,
      sampleCustomers: data.data?.slice(0, 3).map(c => ({ id: c.id, name: c.name, email: c.email }))
    })

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

    logger.info('[Stripe Customers] Transformation complete', {
      count: customers.length,
      sampleCustomers: customers.slice(0, 3).map(c => ({ id: c.id, label: c.label })),
      allCustomers: customers.map(c => ({ id: c.id, label: c.label }))
    })

    return customers

  } catch (error: any) {
    logger.error('[Stripe Customers] Error fetching customers', {
      error: error.message,
      statusCode: error.statusCode,
      stripeCode: error.code,
      type: error.type
    })

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Stripe authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('Stripe API rate limit exceeded. Please try again later.')
    }

    throw new Error(error.message || 'Error fetching Stripe customers')
  }
}
