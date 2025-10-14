/**
 * Airtable Integration Utilities
 */

import { AirtableApiError } from './types'
import { fetchAirtableWithRetry } from '@/lib/integrations/airtableRateLimiter'

import { logger } from '@/lib/utils/logger'

/**
 * Create Airtable API error with proper context
 */
export function createAirtableApiError(message: string, status?: number, response?: Response): AirtableApiError {
  const error = new Error(message) as AirtableApiError
  error.status = status
  error.name = 'AirtableApiError'
  
  if (status === 401) {
    error.message = 'Airtable authentication expired. Please reconnect your account.'
  } else if (status === 403) {
    error.message = 'Airtable API access forbidden. Check your permissions and scopes.'
  } else if (status === 429) {
    error.message = 'Airtable API rate limit exceeded. Please try again later.'
  } else if (status === 404) {
    error.message = 'Airtable resource not found. Check if the base or table still exists.'
  } else if (status === 422) {
    error.message = 'Airtable API request invalid. Check your parameters.'
  }
  
  return error
}

/**
 * Validate Airtable integration has required access token
 */
export function validateAirtableIntegration(integration: any): void {
  if (!integration) {
    throw new Error('Airtable integration not found')
  }
  
  if (!integration.access_token) {
    throw new Error('Airtable authentication required. Please reconnect your account.')
  }
  
  if (integration.provider !== 'airtable') {
    throw new Error('Invalid integration provider. Expected Airtable.')
  }
  
  if (integration.status !== 'connected') {
    throw new Error(`Airtable integration not connected, status: ${integration.status}`)
  }
}

/**
 * Make authenticated request to Airtable API with retry logic
 */
export async function makeAirtableApiRequest(
  url: string, 
  accessToken: string, 
  options: RequestInit = {}
): Promise<Response> {
  return fetchAirtableWithRetry(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

/**
 * Get standard Airtable API headers
 */
export function getAirtableApiHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Parse Airtable API response with error handling
 */
export async function parseAirtableApiResponse<T>(response: Response): Promise<T[]> {
  if (!response.ok) {
    const errorText = await response.text()
    logger.error(`❌ Airtable API error: ${response.status} ${errorText}`)
    
    throw createAirtableApiError(
      `Airtable API error: ${response.status}`,
      response.status,
      response
    )
  }
  
  const data = await response.json()
  
  // Airtable API typically returns results in a 'records' array for data
  if (data.records && Array.isArray(data.records)) {
    return data.records
  }
  
  // Some endpoints (like bases) return different structures
  if (data.bases && Array.isArray(data.bases)) {
    return data.bases
  }
  
  // Tables metadata endpoint
  if (data.tables && Array.isArray(data.tables)) {
    return data.tables
  }
  
  // Some endpoints return the array directly
  if (Array.isArray(data)) {
    return data
  }
  
  // Single object response - wrap in array
  return [data]
}

/**
 * Simplified Airtable token validation (without complex refresh logic)
 */
export async function validateAirtableToken(integration: any): Promise<{ success: boolean, token?: string, error?: string }> {
  try {
    if (!integration.access_token) {
      return {
        success: false,
        error: "No access token found"
      }
    }

    // For now, just return the token as-is
    // TODO: Add proper token validation against Airtable API if needed
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
 * Build Airtable API URL with proper base
 */
export function buildAirtableApiUrl(endpoint: string): string {
  const baseUrl = 'https://api.airtable.com'
  return `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`
}