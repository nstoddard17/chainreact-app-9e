/**
 * Stripe Integration Utility Functions
 */

import { StripeIntegration } from './types'
import { logger } from '@/lib/utils/logger'

/**
 * Validate Stripe integration
 */
export function validateStripeIntegration(integration: StripeIntegration): void {
  if (integration.status !== 'connected') {
    throw new Error('Stripe integration is not connected')
  }

  if (!integration.access_token) {
    throw new Error('No access token found for Stripe integration')
  }
}

/**
 * Make Stripe API request
 */
export async function makeStripeApiRequest(
  url: string,
  token: string,
  method: string = 'GET',
  body?: any
): Promise<Response> {
  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  }

  if (body && method !== 'GET') {
    options.body = new URLSearchParams(body).toString()
  }

  const response = await fetch(url, options)

  if (!response.ok) {
    const errorText = await response.text()
    logger.error('[Stripe API] Request failed:', {
      status: response.status,
      statusText: response.statusText,
      errorText
    })

    if (response.status === 401) {
      throw new Error('Stripe authentication failed. Please reconnect your account.')
    }

    if (response.status === 429) {
      throw new Error('Stripe API rate limit exceeded. Please try again later.')
    }

    throw new Error(`Stripe API error: ${response.status} - ${errorText}`)
  }

  return response
}

/**
 * Parse Stripe API response
 */
export async function parseStripeApiResponse<T>(response: Response): Promise<T> {
  try {
    const data = await response.json()
    return data
  } catch (error) {
    logger.error('[Stripe API] Failed to parse response:', error)
    throw new Error('Failed to parse Stripe API response')
  }
}
