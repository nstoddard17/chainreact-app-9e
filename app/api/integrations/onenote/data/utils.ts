/**
 * OneNote Integration Utilities
 */

import { OneNoteApiError } from './types'

/**
 * Create OneNote API error with proper context
 */
export function createOneNoteApiError(message: string, status?: number, response?: Response): OneNoteApiError {
  const error = new Error(message) as OneNoteApiError
  error.status = status
  error.name = 'OneNoteApiError'
  
  if (status === 401) {
    error.message = 'Microsoft authentication expired. Please reconnect your account.'
  } else if (status === 403) {
    error.message = 'OneNote API access forbidden. Check your permissions.'
  } else if (status === 429) {
    error.message = 'Microsoft Graph API rate limit exceeded. Please try again later.'
  } else if (status === 404) {
    error.message = 'OneNote resource not found. Check if the notebook or data still exists.'
  }
  
  return error
}

/**
 * Validate OneNote integration has required access token
 */
export function validateOneNoteIntegration(integration: any): void {
  if (!integration) {
    throw new Error('OneNote integration not found')
  }
  
  if (!integration.access_token) {
    throw new Error('Microsoft authentication required. Please reconnect your account.')
  }
  
  if (integration.provider !== 'onenote' && integration.provider !== 'microsoft-onenote') {
    throw new Error('Invalid integration provider. Expected OneNote.')
  }
  
  if (integration.status !== 'connected') {
    throw new Error(`OneNote integration not connected, status: ${integration.status}`)
  }
}

/**
 * Make authenticated request to Microsoft Graph API for OneNote
 */
export async function makeOneNoteApiRequest(
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
 * Get standard Microsoft Graph API headers for OneNote
 */
export function getOneNoteApiHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Try multiple OneNote API endpoints with fallbacks
 */
export async function tryMultipleOneNoteEndpoints<T>(
  accessToken: string,
  endpoints: string[],
  operation: string
): Promise<{ data: T[], error?: { message: string } }> {
  console.log(`🔍 Trying ${endpoints.length} OneNote endpoints for ${operation}...`)
  
  for (const endpoint of endpoints) {
    try {
      console.log(`🔍 Trying endpoint: ${endpoint}`)
      
      const response = await makeOneNoteApiRequest(endpoint, accessToken)
      
      if (response.ok) {
        const data = await response.json()
        console.log(`✅ OneNote API success! Found ${data.value?.length || 0} items`)
        
        if (data.value && data.value.length > 0) {
          return {
            data: data.value || [],
            error: undefined
          }
        }
      } else {
        const errorText = await response.text()
        console.log(`❌ OneNote API failed: ${response.status} ${errorText}`)
      }
    } catch (error) {
      console.log(`❌ OneNote API error:`, error)
    }
  }
  
  console.log(`❌ All OneNote endpoints failed for ${operation}`)
  return {
    data: [],
    error: {
      message: `No ${operation} found or API access failed`
    }
  }
}

/**
 * Simplified OneNote token validation (without complex refresh logic)
 */
export async function validateOneNoteToken(integration: any): Promise<{ success: boolean, token?: string, error?: string }> {
  try {
    if (!integration.access_token) {
      return {
        success: false,
        error: "No access token found"
      }
    }

    // For now, just return the token as-is
    // TODO: Add proper token validation against Microsoft Graph API if needed
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