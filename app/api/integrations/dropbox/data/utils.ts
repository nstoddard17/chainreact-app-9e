/**
 * Dropbox Integration Utilities
 */

import { DropboxApiError } from './types'
import { safeDecrypt } from '@/lib/security/encryption'

/**
 * Create Dropbox API error with proper context
 */
export function createDropboxApiError(message: string, status?: number, response?: Response, errorSummary?: string): DropboxApiError {
  const error = new Error(message) as DropboxApiError
  error.status = status
  error.name = 'DropboxApiError'
  error.error_summary = errorSummary
  
  if (status === 401) {
    error.message = 'Dropbox authentication expired. Please reconnect your account.'
  } else if (status === 403) {
    error.message = 'Dropbox API access forbidden. Check your permissions.'
  } else if (status === 429) {
    error.message = 'Dropbox API rate limit exceeded. Please try again later.'
  } else if (status === 404) {
    error.message = 'Dropbox resource not found.'
  }
  
  return error
}

/**
 * Validate Dropbox integration has required access token
 */
export function validateDropboxIntegration(integration: any): void {
  if (!integration) {
    throw new Error('Dropbox integration not found')
  }
  
  if (!integration.access_token) {
    throw new Error('Dropbox authentication required. Please reconnect your account.')
  }
  
  if (integration.provider !== 'dropbox') {
    throw new Error('Invalid integration provider. Expected Dropbox.')
  }
  
  if (integration.status !== 'connected') {
    throw new Error(`Dropbox integration not connected, status: ${integration.status}`)
  }
}

/**
 * Make authenticated request to Dropbox API
 */
export async function makeDropboxApiRequest(
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
 * Get standard Dropbox API headers
 */
export function getDropboxApiHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Parse Dropbox API response with error handling
 */
export async function parseDropboxApiResponse<T>(response: Response): Promise<T[]> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error(`❌ Dropbox API error: ${response.status}`, errorData)
    
    throw createDropboxApiError(
      `Dropbox API error: ${response.status}`,
      response.status,
      response,
      errorData.error_summary
    )
  }
  
  const data = await response.json()
  
  // Dropbox API typically returns results in an 'entries' array
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
 * Simplified Dropbox token validation
 */
export async function validateDropboxToken(integration: any): Promise<{ success: boolean, token?: string, error?: string }> {
  try {
    if (!integration.access_token) {
      return {
        success: false,
        error: "No access token found"
      }
    }

    const decryptedToken = safeDecrypt(integration.access_token)

    if (!decryptedToken) {
      return {
        success: false,
        error: 'Dropbox authentication required. Please reconnect your account.'
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

/**
 * Build Dropbox API URL
 */
export function buildDropboxApiUrl(endpoint: string): string {
  const baseUrl = 'https://api.dropboxapi.com/2'
  return `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`
}

/**
 * Create Dropbox API request body for list_folder
 */
export function createListFolderRequestBody(options: any = {}): any {
  const {
    path = "",
    recursive = false,
    includeMediaInfo = false,
    includeDeleted = false,
    includeHasExplicitSharedMembers = false,
    includeMountedFolders = true,
    includeNonDownloadableFiles = false,
    limit = 2000
  } = options

  return {
    path,
    recursive,
    include_media_info: includeMediaInfo,
    include_deleted: includeDeleted,
    include_has_explicit_shared_members: includeHasExplicitSharedMembers,
    include_mounted_folders: includeMountedFolders,
    include_non_downloadable_files: includeNonDownloadableFiles,
    limit
  }
}
