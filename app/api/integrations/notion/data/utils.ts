/**
 * Notion Integration Utilities
 */

import { NotionApiError } from './types'

/**
 * Create Notion API error with proper context
 */
export function createNotionApiError(message: string, status?: number, response?: Response): NotionApiError {
  const error = new Error(message) as NotionApiError
  error.status = status
  error.name = 'NotionApiError'
  
  if (status === 401) {
    error.message = 'Notion authentication expired. Please reconnect your account.'
  } else if (status === 403) {
    error.message = 'Notion API access forbidden. Check your permissions.'
  } else if (status === 429) {
    error.message = 'Notion API rate limit exceeded. Please try again later.'
  } else if (status === 404) {
    error.message = 'Notion resource not found. Check if the page or database still exists.'
  }
  
  return error
}

/**
 * Validate Notion integration has required access token
 */
export function validateNotionIntegration(integration: any): void {
  if (!integration) {
    throw new Error('Notion integration not found')
  }
  
  if (!integration.access_token) {
    throw new Error('Notion authentication required. Please reconnect your account.')
  }
  
  if (integration.provider !== 'notion') {
    throw new Error('Invalid integration provider. Expected Notion.')
  }
  
  // Note: We're lenient about status since we have a valid access token
  // The main requirement is having an access token, not a specific status
}

/**
 * Make authenticated request to Notion API
 */
export async function makeNotionApiRequest(
  url: string, 
  accessToken: string, 
  options: RequestInit = {}
): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
      ...options.headers,
    },
  })

  if (!response.ok) {
    throw createNotionApiError(
      `Notion API error: ${response.status} - ${response.statusText}`,
      response.status,
      response
    )
  }

  return response
}

/**
 * Get standard Notion API headers
 */
export function getNotionApiHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
  }
}

/**
 * Extract plain text from Notion rich text array
 */
export function extractPlainText(richText: any[]): string {
  if (!Array.isArray(richText)) return ''
  return richText.map(text => text.plain_text || '').join('')
}

/**
 * Get page title from Notion page properties
 */
export function getPageTitle(page: any): string {
  if (!page?.properties) return 'Untitled'
  
  // Find the title property
  for (const [key, property] of Object.entries(page.properties)) {
    if ((property as any)?.type === 'title') {
      const titleArray = (property as any)?.title
      return extractPlainText(titleArray) || 'Untitled'
    }
  }
  
  return 'Untitled'
}

/**
 * Get database title from Notion database
 */
export function getDatabaseTitle(database: any): string {
  if (!database?.title) return 'Untitled Database'
  return extractPlainText(database.title) || 'Untitled Database'
}

/**
 * Simplified token validation for Notion
 * Note: This is a simplified version that doesn't handle token refresh
 * For production, should use the full validateAndRefreshToken function
 */
export async function validateNotionToken(integration: any): Promise<{ success: boolean, token?: string, error?: string }> {
  try {
    if (!integration.access_token) {
      return {
        success: false,
        error: "No access token found"
      }
    }

    // For now, just return the token as-is
    // TODO: Add proper encryption/decryption and refresh logic
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