/**
 * Facebook Integration Utilities
 */

import { FacebookApiError } from './types'

/**
 * Create Facebook API error with proper context
 */
export function createFacebookApiError(message: string, status?: number, response?: Response): FacebookApiError {
  const error = new Error(message) as FacebookApiError
  error.status = status
  error.name = 'FacebookApiError'
  
  if (status === 401) {
    error.message = 'Facebook authentication expired. Please reconnect your account.'
  } else if (status === 403) {
    error.message = 'Facebook API access forbidden. Check your permissions.'
  } else if (status === 429) {
    error.message = 'Facebook API rate limit exceeded. Please try again later.'
  } else if (status === 404) {
    error.message = 'Facebook resource not found. Check if the page or data still exists.'
  }
  
  return error
}

/**
 * Validate Facebook integration has required access token
 */
export function validateFacebookIntegration(integration: any): void {
  if (!integration) {
    throw new Error('Facebook integration not found')
  }
  
  if (!integration.access_token) {
    throw new Error('Facebook authentication required. Please reconnect your account.')
  }
  
  if (integration.provider !== 'facebook') {
    throw new Error('Invalid integration provider. Expected Facebook.')
  }
  
  // Note: We're lenient about status since we have a valid access token
  // The main requirement is having an access token, not a specific status
}

/**
 * Generate Facebook app secret proof for secure API calls
 */
export function generateAppSecretProof(accessToken: string): string {
  const crypto = require('crypto')
  const appSecret = process.env.FACEBOOK_CLIENT_SECRET
  
  if (!appSecret) {
    throw new Error('Facebook app secret not configured')
  }
  
  return crypto
    .createHmac('sha256', appSecret)
    .update(accessToken)
    .digest('hex')
}

/**
 * Make authenticated request to Facebook Graph API
 */
export async function makeFacebookApiRequest(
  url: string, 
  accessToken: string, 
  options: RequestInit = {}
): Promise<Response> {
  const appsecretProof = generateAppSecretProof(accessToken)
  
  // Add appsecret_proof to URL parameters
  const urlObj = new URL(url)
  urlObj.searchParams.set('appsecret_proof', appsecretProof)
  
  return fetch(urlObj.toString(), {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

/**
 * Get standard Facebook API headers
 */
export function getFacebookApiHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Simplified Facebook token validation (without complex refresh logic)
 */
export async function validateFacebookToken(integration: any): Promise<{ success: boolean, token?: string, error?: string }> {
  try {
    if (!integration.access_token) {
      return {
        success: false,
        error: "No access token found"
      }
    }

    // For now, just return the token as-is
    // TODO: Add proper token validation against Facebook API if needed
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