/**
 * OneDrive Integration Utilities
 */

import { OneDriveApiError } from './types'
import { getMicrosoftGraphClient } from '@/lib/microsoft-graph/client'
import { safeDecrypt } from '@/lib/security/encryption'

import { logger } from '@/lib/utils/logger'

/**
 * Create OneDrive API error with proper context
 */
export function createOneDriveApiError(message: string, status?: number, response?: Response): OneDriveApiError {
  const error = new Error(message) as OneDriveApiError
  error.status = status
  error.name = 'OneDriveApiError'
  
  if (status === 401) {
    error.message = 'Microsoft authentication expired. Please reconnect your account.'
  } else if (status === 403) {
    error.message = 'OneDrive API access forbidden. Check your permissions.'
  } else if (status === 429) {
    error.message = 'Microsoft Graph API rate limit exceeded. Please try again later.'
  } else if (status === 404) {
    error.message = 'OneDrive resource not found. Check if the folder or file still exists.'
  }
  
  return error
}

/**
 * Validate OneDrive integration has required access token
 */
export function validateOneDriveIntegration(integration: any): void {
  if (!integration) {
    throw new Error('OneDrive integration not found')
  }
  
  if (!integration.access_token) {
    throw new Error('Microsoft authentication required. Please reconnect your account.')
  }
  
  if (integration.provider !== 'onedrive' && integration.provider !== 'microsoft-onedrive') {
    throw new Error('Invalid integration provider. Expected OneDrive.')
  }
  
  if (integration.status !== 'connected') {
    throw new Error(`OneDrive integration not connected, status: ${integration.status}`)
  }
}

/**
 * Make authenticated request to Microsoft Graph API for OneDrive
 */
export async function makeOneDriveApiRequest(
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
 * Get standard Microsoft Graph API headers for OneDrive
 */
export function getOneDriveApiHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Parse Microsoft Graph API response with error handling
 */
export async function parseOneDriveApiResponse<T>(response: Response): Promise<T[]> {
  if (!response.ok) {
    const errorText = await response.text()
    logger.error(`❌ OneDrive API error: ${response.status} ${errorText}`)
    
    throw createOneDriveApiError(
      `Microsoft Graph API error: ${response.status}`,
      response.status,
      response
    )
  }
  
  const data = await response.json()
  
  // Microsoft Graph API typically returns results in a 'value' array
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
 * Simplified OneDrive token validation (without complex refresh logic)
 */
export async function validateOneDriveToken(integration: any): Promise<{ success: boolean, token?: string, error?: string }> {
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

/**
 * Build Microsoft Graph API URL for OneDrive
 */
export function buildOneDriveApiUrl(endpoint: string): string {
  const baseUrl = 'https://graph.microsoft.com'
  // Ensure endpoint includes version if not present
  const versionedEndpoint = endpoint.startsWith('/v1.0/') || endpoint.startsWith('v1.0/')
    ? endpoint
    : `/v1.0${endpoint.startsWith('/') ? endpoint : `/${ endpoint}`}`
  return `${baseUrl}${versionedEndpoint}`
}

export async function getOneDriveClient(integration: any) {
  validateOneDriveIntegration(integration)
  const decryptedToken = typeof integration.access_token === 'string'
    ? safeDecrypt(integration.access_token)
    : null

  if (!decryptedToken) {
    throw new Error('Microsoft authentication expired. Please reconnect your account.')
  }

  return getMicrosoftGraphClient(decryptedToken)
}