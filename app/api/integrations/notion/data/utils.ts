/**
 * Notion Integration Utilities
 */

import { NotionApiError, NotionIntegration } from './types'
import { decrypt } from '@/lib/security/encryption'
import { logger } from '@/lib/utils/logger'

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
 * Resolve the correct (decrypted) access token for a Notion integration.
 * If a workspace is provided and has its own token, prefer that value.
 */
export function resolveNotionAccessToken(
  integration: NotionIntegration,
  workspaceId?: string
): string {
  const encryptionKey = process.env.ENCRYPTION_KEY
  if (!encryptionKey) {
    throw new Error('Notion encryption key missing. Please configure ENCRYPTION_KEY.')
  }

  let encryptedToken = integration.access_token

  if (workspaceId && integration.metadata?.workspaces) {
    const workspaceToken = integration.metadata.workspaces[workspaceId]?.access_token
    if (workspaceToken) {
      encryptedToken = workspaceToken
      logger.debug('[Notion] Using workspace-specific access token', { workspaceId })
    } else {
      logger.debug('[Notion] Workspace token missing, falling back to primary token', { workspaceId })
    }
  }

  if (!encryptedToken) {
    throw new Error('Notion authentication required. Please reconnect your account.')
  }

  return decrypt(encryptedToken, encryptionKey)
}

export interface NotionRequestContext {
  workspace?: string
  workspaceId?: string
  [key: string]: any
}

export function getNotionRequestOptions(context?: NotionRequestContext): {
  workspaceId?: string
} {
  return {
    workspaceId: context?.workspaceId || context?.workspace
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
  // First try the standard title field (array of rich text)
  if (database?.title && Array.isArray(database.title) && database.title.length > 0) {
    const title = extractPlainText(database.title)
    if (title) return title
  }
  
  // Some databases have title as a single rich text object
  if (database?.title?.plain_text) {
    return database.title.plain_text
  }
  
  // Check if title is in properties (for database views or linked databases)
  if (database?.properties) {
    // Look for any property with type 'title'
    for (const [propName, prop] of Object.entries(database.properties)) {
      if ((prop as any).type === 'title' && (prop as any).title) {
        const title = extractPlainText((prop as any).title)
        if (title) return title
      }
    }
    
    // Common property names that might contain the database name
    const titlePropertyNames = ['Name', 'name', 'Title', 'title', 'Database', 'database']
    for (const propName of titlePropertyNames) {
      if (database.properties[propName]) {
        const prop = database.properties[propName]
        if ((prop as any).title) {
          const title = extractPlainText((prop as any).title)
          if (title) return title
        }
      }
    }
  }
  
  // For database views, the description might contain the view name
  if (database?.description && Array.isArray(database.description) && database.description.length > 0) {
    const desc = extractPlainText(database.description)
    if (desc && desc.includes('View of')) {
      return desc // This might be "View of Global Offices"
    }
  }
  
  return 'Untitled Database'
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

    // Decrypt the access token
    const { decrypt } = await import('@/lib/security/encryption')
    const decryptedToken = decrypt(integration.access_token)
    
    if (!decryptedToken) {
      return {
        success: false,
        error: "Failed to decrypt access token"
      }
    }

    return {
      success: true,
      token: decryptedToken
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Token validation failed"
    }
  }
}
