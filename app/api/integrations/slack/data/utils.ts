/**
 * Slack Integration Utilities
 */

import { SlackApiError } from './types'

/**
 * Create Slack API error with proper context
 */
export function createSlackApiError(message: string, status?: number, response?: Response): SlackApiError {
  const error = new Error(message) as SlackApiError
  error.status = status
  error.name = 'SlackApiError'
  
  if (status === 401) {
    error.message = 'Slack authentication expired. Please reconnect your account.'
  } else if (status === 403) {
    error.message = 'Slack API access forbidden. Check your permissions.'
  } else if (status === 429) {
    error.message = 'Slack API rate limit exceeded. Please try again later.'
  }
  
  return error
}

/**
 * Validate Slack integration has required access token
 */
export function validateSlackIntegration(integration: any): void {
  if (!integration) {
    throw new Error('Slack integration not found')
  }
  
  if (!integration.access_token) {
    throw new Error('Slack authentication required. Please reconnect your account.')
  }
  
  if (integration.provider !== 'slack') {
    throw new Error('Invalid integration provider. Expected Slack.')
  }
  
  // Note: We're lenient about status since we have a valid access token
  // The main requirement is having an access token, not a specific status
}

/**
 * Make authenticated request to Slack API
 */
export async function makeSlackApiRequest(
  url: string, 
  accessToken: string, 
  options: RequestInit = {}
): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    throw createSlackApiError(
      `Slack API error: ${response.status} - ${response.statusText}`,
      response.status,
      response
    )
  }

  return response
}

/**
 * Get standard Slack API headers
 */
export function getSlackApiHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}