/**
 * Gumroad Integration Utilities
 */

import { GumroadApiError } from './types'

import { logger } from '@/lib/utils/logger'

/**
 * Create Gumroad API error with proper context
 */
export function createGumroadApiError(message: string, status?: number, response?: Response): GumroadApiError {
  const error = new Error(message) as GumroadApiError
  error.status = status
  error.name = 'GumroadApiError'
  
  if (status === 401) {
    error.message = 'Gumroad authentication expired. Please reconnect your account.'
  } else if (status === 403) {
    error.message = 'Gumroad API access forbidden. Check your permissions.'
  } else if (status === 429) {
    error.message = 'Gumroad API rate limit exceeded. Please try again later.'
  } else if (status === 404) {
    error.message = 'Gumroad resource not found.'
  }
  
  return error
}

/**
 * Validate Gumroad integration has required access token
 */
export function validateGumroadIntegration(integration: any): void {
  if (!integration) {
    throw new Error('Gumroad integration not found')
  }
  
  if (!integration.access_token) {
    throw new Error('Gumroad authentication required. Please reconnect your account.')
  }
  
  if (integration.provider !== 'gumroad') {
    throw new Error('Invalid integration provider. Expected Gumroad.')
  }
  
  if (integration.status !== 'connected') {
    throw new Error(`Gumroad integration not connected, status: ${integration.status}`)
  }
}

/**
 * Make authenticated request to Gumroad API
 */
export async function makeGumroadApiRequest(
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
 * Get standard Gumroad API headers
 */
export function getGumroadApiHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Parse Gumroad API response with error handling
 */
export async function parseGumroadApiResponse<T>(response: Response): Promise<T[]> {
  if (!response.ok) {
    const errorText = await response.text()
    logger.error(`❌ Gumroad API error: ${response.status} ${errorText}`)
    
    throw createGumroadApiError(
      `Gumroad API error: ${response.status}`,
      response.status,
      response
    )
  }
  
  const data = await response.json()
  
  // Gumroad API typically returns results in a specific structure
  if (data.products && Array.isArray(data.products)) {
    return data.products
  }
  
  // Some endpoints return the array directly
  if (Array.isArray(data)) {
    return data
  }
  
  // Single object response - wrap in array
  return [data]
}

/**
 * Simplified Gumroad token validation
 */
export async function validateGumroadToken(integration: any): Promise<{ success: boolean, token?: string, error?: string }> {
  try {
    if (!integration.access_token) {
      return {
        success: false,
        error: "No access token found"
      }
    }

    // For now, just return the token as-is
    // TODO: Add proper token validation against Gumroad API if needed
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
 * Build Gumroad API URL
 */
export function buildGumroadApiUrl(endpoint: string): string {
  const baseUrl = 'https://api.gumroad.com/v2'
  return `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`
}