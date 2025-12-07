/**
 * Stripe Prices Handler
 * API VERIFICATION: Uses Stripe API GET /v1/prices with expand[]=product
 * Docs: https://stripe.com/docs/api/prices/list
 */

import { StripeIntegration, StripePrice, StripeDataHandler } from '../types'
import { validateStripeIntegration, makeStripeApiRequest, parseStripeApiResponse } from '../utils'
import { logger } from '@/lib/utils/logger'

export const getStripePrices: StripeDataHandler<StripePrice> = async (
  integration: StripeIntegration,
  options: any = {}
): Promise<StripePrice[]> => {
  logger.info('[Stripe Prices] Starting fetch', {
    integrationId: integration.id,
    hasToken: !!integration.access_token,
    options,
    timestamp: new Date().toISOString()
  })

  try {
    // Validate integration
    logger.info('[Stripe Prices] Validating integration', {
      integrationId: integration.id,
      provider: integration.provider,
      status: integration.status
    })
    validateStripeIntegration(integration)
    logger.info('[Stripe Prices] Integration validated successfully')

    // Build API URL with pagination and expand product data
    const limit = options.limit || 100
    const params = new URLSearchParams({
      limit: limit.toString(),
      active: 'true', // Only get active prices
      'expand[]': 'data.product' // Expand product data to get product names
    })

    // Add search query if provided (searches price ID)
    if (options.search) {
      logger.info('[Stripe Prices] Adding search filter', { search: options.search })
      // Note: Stripe doesn't support direct price search, but we'll filter client-side
    }

    const apiUrl = `https://api.stripe.com/v1/prices?${params.toString()}`
    logger.info('[Stripe Prices] Making API request', {
      apiUrl,
      method: 'GET',
      limit
    })

    // Make API request
    const response = await makeStripeApiRequest(
      apiUrl,
      integration.access_token,
      'GET'
    )

    logger.info('[Stripe Prices] API response received', {
      status: response.status,
      ok: response.ok,
      statusText: response.statusText
    })

    // Parse response
    const data = await parseStripeApiResponse<{ data: any[] }>(response)
    logger.info('[Stripe Prices] Response parsed', {
      priceCount: data.data?.length || 0,
      hasData: !!data.data
    })

    // Transform prices into combobox format
    const prices: StripePrice[] = data.data.map((price) => {
      const product = price.product
      const productName = typeof product === 'string'
        ? product
        : product?.name || 'Unnamed Product'

      // Format amount (convert from cents to dollars)
      const amount = price.unit_amount !== null
        ? price.unit_amount / 100
        : null

      // Build label with product name and price details
      let label = productName

      if (amount !== null) {
        const formattedAmount = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: price.currency?.toUpperCase() || 'USD'
        }).format(amount)

        if (price.type === 'recurring' && price.recurring) {
          const interval = price.recurring.interval
          const intervalCount = price.recurring.interval_count || 1
          const intervalText = intervalCount > 1
            ? `${intervalCount} ${interval}s`
            : interval
          label = `${productName} - ${formattedAmount}/${intervalText}`
        } else {
          label = `${productName} - ${formattedAmount}`
        }
      }

      // Add price ID for clarity
      label = `${label} (${price.id})`

      return {
        id: price.id,
        value: price.id,
        label,
        productName,
        amount,
        currency: price.currency,
        interval: price.recurring?.interval,
        intervalCount: price.recurring?.interval_count,
        type: price.type
      }
    })

    // Filter by search if provided (client-side filtering)
    let filteredPrices = prices
    if (options.search) {
      const searchLower = options.search.toLowerCase()
      filteredPrices = prices.filter(p =>
        p.label.toLowerCase().includes(searchLower) ||
        p.id.toLowerCase().includes(searchLower) ||
        p.productName.toLowerCase().includes(searchLower)
      )
      logger.info('[Stripe Prices] Filtered by search', {
        originalCount: prices.length,
        filteredCount: filteredPrices.length,
        search: options.search
      })
    }

    logger.info('[Stripe Prices] Transformation complete', {
      count: filteredPrices.length,
      samplePrices: filteredPrices.slice(0, 3).map(p => ({ id: p.id, label: p.label }))
    })

    return filteredPrices

  } catch (error: any) {
    logger.error('[Stripe Prices] Error fetching prices', {
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

    throw new Error(error.message || 'Error fetching Stripe prices')
  }
}