/**
 * Microsoft Outlook Integration Utilities
 */

import { OutlookApiError } from './types'

/**
 * Create Outlook API error with proper context
 */
export function createOutlookApiError(message: string, status?: number, response?: Response): OutlookApiError {
  const error = new Error(message) as OutlookApiError
  error.status = status
  error.name = 'OutlookApiError'
  
  if (status === 401) {
    error.message = 'Microsoft authentication expired. Please reconnect your account.'
  } else if (status === 403) {
    error.message = 'Outlook API access forbidden. Check your permissions.'
  } else if (status === 429) {
    error.message = 'Microsoft Graph API rate limit exceeded. Please try again later.'
  } else if (status === 404) {
    error.message = 'Outlook resource not found. Check if the folder or data still exists.'
  }
  
  return error
}

/**
 * Validate Outlook integration has required access token
 */
export function validateOutlookIntegration(integration: any): void {
  if (!integration) {
    throw new Error('Outlook integration not found')
  }
  
  if (!integration.access_token) {
    throw new Error('Microsoft authentication required. Please reconnect your account.')
  }
  
  if (integration.provider !== 'outlook' && integration.provider !== 'microsoft-outlook') {
    throw new Error('Invalid integration provider. Expected Outlook.')
  }
  
  if (integration.status !== 'connected') {
    throw new Error(`Outlook integration not connected, status: ${integration.status}`)
  }
}

/**
 * Make authenticated request to Microsoft Graph API for Outlook
 */
export async function makeOutlookApiRequest(
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
 * Get standard Microsoft Graph API headers for Outlook
 */
export function getOutlookApiHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Parse Microsoft Graph API response with error handling
 */
export async function parseOutlookApiResponse<T>(response: Response): Promise<T[]> {
  if (!response.ok) {
    const errorText = await response.text()
    console.error(`❌ Outlook API error: ${response.status} ${errorText}`)
    
    throw createOutlookApiError(
      `Microsoft Graph API error: ${response.status}`,
      response.status,
      response
    )
  }
  
  const data = await response.json()
  return data.value || []
}

/**
 * Simplified Outlook token validation (without complex refresh logic)
 */
export async function validateOutlookToken(integration: any): Promise<{ success: boolean, token?: string, error?: string }> {
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