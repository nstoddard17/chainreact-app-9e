/**
 * Trello Integration Utilities
 */

import { TrelloApiError } from './types'
import { safeDecrypt } from '@/lib/security/encryption'

import { logger } from '@/lib/utils/logger'

/**
 * Create Trello API error with proper context
 */
export function createTrelloApiError(message: string, status?: number, response?: Response): TrelloApiError {
  const error = new Error(message) as TrelloApiError
  error.status = status
  error.name = 'TrelloApiError'
  
  if (status === 401) {
    error.message = 'Trello authentication expired. Please reconnect your account.'
  } else if (status === 403) {
    error.message = 'Trello API access forbidden. Check your permissions.'
  } else if (status === 429) {
    error.message = 'Trello API rate limit exceeded. Please try again later.'
  } else if (status === 404) {
    error.message = 'Trello resource not found. Check if the board or card still exists.'
  }
  
  return error
}

/**
 * Validate Trello integration has required access token
 */
export function validateTrelloIntegration(integration: any): void {
  if (!integration) {
    throw new Error('Trello integration not found')
  }
  
  if (!integration.access_token) {
    throw new Error('Trello authentication required. Please reconnect your account.')
  }
  
  if (integration.provider !== 'trello') {
    throw new Error('Invalid integration provider. Expected Trello.')
  }
  
  if (integration.status !== 'connected') {
    throw new Error(`Trello integration not connected, status: ${integration.status}`)
  }
}

/**
 * Make authenticated request to Trello API
 */
export async function makeTrelloApiRequest(
  url: string,
  accessToken: string,
  apiKey?: string | null,
  options: RequestInit = {}
): Promise<Response> {
  const trelloClientId = apiKey && apiKey !== 'null' && apiKey !== 'undefined' ? apiKey : process.env.TRELLO_CLIENT_ID
  if (!trelloClientId) {
    throw new Error('Trello API key is required. Set TRELLO_CLIENT_ID or store the key in the integration record.')
  }

  // Add Trello authentication parameters to URL
  const urlObj = new URL(url)
  urlObj.searchParams.set('key', trelloClientId)
  urlObj.searchParams.set('token', accessToken)

  return fetch(urlObj.toString(), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

/**
 * Get standard Trello API headers (auth is handled via URL params)
 */
export function getTrelloApiHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
  }
}

/**
 * Parse Trello API response with error handling
 */
export async function parseTrelloApiResponse<T>(response: Response): Promise<T[]> {
  if (!response.ok) {
    const errorText = await response.text()
    logger.error(`❌ Trello API error: ${response.status} ${errorText}`)
    
    throw createTrelloApiError(
      `Trello API error: ${response.status}`,
      response.status,
      response
    )
  }
  
  const data = await response.json()
  
  // Trello API typically returns arrays directly
  if (Array.isArray(data)) {
    return data
  }
  
  // Single object response - wrap in array
  return [data]
}

/**
 * Simplified Trello token validation (without complex refresh logic)
 */
export async function validateTrelloToken(integration: any): Promise<{ success: boolean, token?: string, key?: string, error?: string }> {
  try {
    const rawToken = integration.access_token ? safeDecrypt(integration.access_token) : ''
    const metadataKey = typeof integration.metadata?.client_key === 'string' ? integration.metadata.client_key : null
    const rawKey =
      (integration.external_key ? safeDecrypt(integration.external_key) : null) ||
      metadataKey ||
      process.env.TRELLO_CLIENT_ID || ''

    if (!rawToken || rawToken === 'null' || rawToken === 'undefined') {
      return {
        success: false,
        error: 'No access token found'
      }
    }

    const normalizedKey = rawKey && rawKey !== 'null' && rawKey !== 'undefined' ? rawKey : process.env.TRELLO_CLIENT_ID || ''

    return {
      success: true,
      token: rawToken,
      key: normalizedKey
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Token validation failed'
    }
  }
}

/**
 * Build Trello API URL with proper base
 */
export function buildTrelloApiUrl(endpoint: string): string {
  const baseUrl = 'https://api.trello.com'
  return `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`
}
