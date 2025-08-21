/**
 * HubSpot Integration Utilities
 */

import { HubSpotApiError } from './types'

/**
 * Create HubSpot API error with proper context
 */
export function createHubSpotApiError(message: string, status?: number, response?: Response): HubSpotApiError {
  const error = new Error(message) as HubSpotApiError
  error.status = status
  error.name = 'HubSpotApiError'
  
  if (status === 401) {
    error.message = 'HubSpot authentication expired. Please reconnect your account.'
  } else if (status === 403) {
    error.message = 'HubSpot API access forbidden. Check your permissions and scopes.'
  } else if (status === 429) {
    error.message = 'HubSpot API rate limit exceeded. Please try again later.'
  } else if (status === 404) {
    error.message = 'HubSpot resource not found. Check if the data still exists.'
  }
  
  return error
}

/**
 * Validate HubSpot integration has required access token
 */
export function validateHubSpotIntegration(integration: any): void {
  if (!integration) {
    throw new Error('HubSpot integration not found')
  }
  
  if (!integration.access_token) {
    throw new Error('HubSpot authentication required. Please reconnect your account.')
  }
  
  if (integration.provider !== 'hubspot') {
    throw new Error('Invalid integration provider. Expected HubSpot.')
  }
  
  if (integration.status !== 'connected') {
    throw new Error(`HubSpot integration not connected, status: ${integration.status}`)
  }
}

/**
 * Make authenticated request to HubSpot API
 */
export async function makeHubSpotApiRequest(
  url: string, 
  accessToken: string, 
  options: RequestInit = {}
): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

/**
 * Get standard HubSpot API headers
 */
export function getHubSpotApiHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Parse HubSpot API response with error handling
 */
export async function parseHubSpotApiResponse<T>(response: Response): Promise<T[]> {
  if (!response.ok) {
    const errorText = await response.text()
    console.error(`❌ HubSpot API error: ${response.status} ${errorText}`)
    
    throw createHubSpotApiError(
      `HubSpot API error: ${response.status}`,
      response.status,
      response
    )
  }
  
  const data = await response.json()
  
  // HubSpot API typically returns results in a 'results' array
  if (data.results && Array.isArray(data.results)) {
    return data.results
  }
  
  // Some endpoints return the array directly
  if (Array.isArray(data)) {
    return data
  }
  
  // Single object response - wrap in array
  return [data]
}

/**
 * Simplified HubSpot token validation (without complex refresh logic)
 */
export async function validateHubSpotToken(integration: any): Promise<{ success: boolean, token?: string, error?: string }> {
  try {
    if (!integration.access_token) {
      return {
        success: false,
        error: "No access token found"
      }
    }

    // For now, just return the token as-is
    // TODO: Add proper token validation against HubSpot API if needed
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
 * Build HubSpot API URL with proper base
 */
export function buildHubSpotApiUrl(endpoint: string): string {
  const baseUrl = 'https://api.hubapi.com'
  return `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`
}