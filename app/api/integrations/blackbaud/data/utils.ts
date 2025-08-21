/**
 * Blackbaud Integration Utilities
 */

import { BlackbaudApiError } from './types'

/**
 * Create Blackbaud API error with proper context
 */
export function createBlackbaudApiError(message: string, status?: number, response?: Response): BlackbaudApiError {
  const error = new Error(message) as BlackbaudApiError
  error.status = status
  error.name = 'BlackbaudApiError'
  
  if (status === 401) {
    error.message = 'Blackbaud authentication expired. Please reconnect your account.'
  } else if (status === 403) {
    error.message = 'Blackbaud API access forbidden. Check your permissions.'
  } else if (status === 429) {
    error.message = 'Blackbaud API rate limit exceeded. Please try again later.'
  } else if (status === 404) {
    error.message = 'Blackbaud resource not found.'
  }
  
  return error
}

/**
 * Validate Blackbaud integration has required access token
 */
export function validateBlackbaudIntegration(integration: any): void {
  if (!integration) {
    throw new Error('Blackbaud integration not found')
  }
  
  if (!integration.access_token) {
    throw new Error('Blackbaud authentication required. Please reconnect your account.')
  }
  
  if (integration.provider !== 'blackbaud') {
    throw new Error('Invalid integration provider. Expected Blackbaud.')
  }
  
  if (integration.status !== 'connected') {
    throw new Error(`Blackbaud integration not connected, status: ${integration.status}`)
  }
}

/**
 * Make authenticated request to Blackbaud API
 * Note: Blackbaud uses a subscription key in the header, not a Bearer token
 */
export async function makeBlackbaudApiRequest(
  url: string, 
  subscriptionKey: string, 
  options: RequestInit = {}
): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      'Bb-Api-Subscription-Key': subscriptionKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

/**
 * Get standard Blackbaud API headers
 */
export function getBlackbaudApiHeaders(subscriptionKey: string): Record<string, string> {
  return {
    'Bb-Api-Subscription-Key': subscriptionKey,
    'Content-Type': 'application/json',
  }
}

/**
 * Parse Blackbaud API response with error handling
 */
export async function parseBlackbaudApiResponse<T>(response: Response): Promise<T[]> {
  if (!response.ok) {
    const errorText = await response.text()
    console.error(`❌ Blackbaud API error: ${response.status} ${errorText}`)
    
    throw createBlackbaudApiError(
      `Blackbaud API error: ${response.status}`,
      response.status,
      response
    )
  }
  
  const data = await response.json()
  
  // Blackbaud API typically returns results in a 'value' array
  if (data.value && Array.isArray(data.value)) {
    return data.value
  }
  
  // Some endpoints return the array directly
  if (Array.isArray(data)) {
    return data
  }
  
  // Single object response - wrap in array
  return [data]
}

/**
 * Simplified Blackbaud token validation
 */
export async function validateBlackbaudToken(integration: any): Promise<{ success: boolean, token?: string, error?: string }> {
  try {
    if (!integration.access_token) {
      return {
        success: false,
        error: "No subscription key found"
      }
    }

    // For now, just return the subscription key as-is
    // TODO: Add proper token validation against Blackbaud API if needed
    return {
      success: true,
      token: integration.access_token
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Token validation failed"
    }
  }
}

/**
 * Build Blackbaud API URL
 */
export function buildBlackbaudApiUrl(endpoint: string): string {
  const baseUrl = 'https://api.sky.blackbaud.com'
  return `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`
}