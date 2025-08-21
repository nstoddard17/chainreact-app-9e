/**
 * Box Integration Utilities
 */

import { BoxApiError } from './types'

/**
 * Create Box API error with proper context
 */
export function createBoxApiError(message: string, status?: number, response?: Response, contextInfo?: any): BoxApiError {
  const error = new Error(message) as BoxApiError
  error.status = status
  error.name = 'BoxApiError'
  error.context_info = contextInfo
  
  if (status === 401) {
    error.message = 'Box authentication expired. Please reconnect your account.'
  } else if (status === 403) {
    error.message = 'Box API access forbidden. Check your permissions.'
  } else if (status === 429) {
    error.message = 'Box API rate limit exceeded. Please try again later.'
  } else if (status === 404) {
    error.message = 'Box resource not found.'
  }
  
  return error
}

/**
 * Validate Box integration has required access token
 */
export function validateBoxIntegration(integration: any): void {
  if (!integration) {
    throw new Error('Box integration not found')
  }
  
  if (!integration.access_token) {
    throw new Error('Box authentication required. Please reconnect your account.')
  }
  
  if (integration.provider !== 'box') {
    throw new Error('Invalid integration provider. Expected Box.')
  }
  
  if (integration.status !== 'connected') {
    throw new Error(`Box integration not connected, status: ${integration.status}`)
  }
}

/**
 * Make authenticated request to Box API
 */
export async function makeBoxApiRequest(
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
 * Get standard Box API headers
 */
export function getBoxApiHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Parse Box API response with error handling
 */
export async function parseBoxApiResponse<T>(response: Response): Promise<T[]> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error(`❌ Box API error: ${response.status}`, errorData)
    
    throw createBoxApiError(
      `Box API error: ${response.status}`,
      response.status,
      response,
      errorData.context_info
    )
  }
  
  const data = await response.json()
  
  // Box API typically returns results in an 'entries' array
  if (data.entries && Array.isArray(data.entries)) {
    return data.entries
  }
  
  // Some endpoints return the array directly
  if (Array.isArray(data)) {
    return data
  }
  
  // Single object response - wrap in array
  return [data]
}

/**
 * Simplified Box token validation
 */
export async function validateBoxToken(integration: any): Promise<{ success: boolean, token?: string, error?: string }> {
  try {
    if (!integration.access_token) {
      return {
        success: false,
        error: "No access token found"
      }
    }

    // For now, just return the token as-is
    // TODO: Add proper token validation against Box API if needed
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
 * Build Box API URL
 */
export function buildBoxApiUrl(endpoint: string): string {
  const baseUrl = 'https://api.box.com/2.0'
  return `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`
}

/**
 * Create Box API query parameters for folder items
 */
export function createFolderItemsQueryParams(options: any = {}): string {
  const {
    fields = 'id,name,type,created_at,modified_at',
    limit = 1000,
    offset = 0,
    usemarker = false,
    marker = ''
  } = options

  const params = new URLSearchParams()
  params.append('fields', fields)
  params.append('limit', limit.toString())
  
  if (usemarker && marker) {
    params.append('usemarker', 'true')
    params.append('marker', marker)
  } else {
    params.append('offset', offset.toString())
  }

  return params.toString()
}