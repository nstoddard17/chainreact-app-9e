/**
 * Google Integration Utilities
 */

import { GoogleApiError } from './types'
import { decrypt } from '@/lib/security/encryption'

import { logger } from '@/lib/utils/logger'

/**
 * Create Google API error with proper context
 */
export function createGoogleApiError(message: string, status?: number, response?: Response): GoogleApiError {
  const error = new Error(message) as GoogleApiError
  error.status = status
  error.name = 'GoogleApiError'
  
  if (status === 401) {
    error.message = 'Google authentication expired. Please reconnect your account.'
  } else if (status === 403) {
    error.message = 'Google API access forbidden. Check your permissions and quotas.'
  } else if (status === 429) {
    error.message = 'Google API rate limit exceeded. Please try again later.'
  } else if (status === 404) {
    error.message = 'Google resource not found. Check if the file or folder still exists.'
  }
  
  return error
}

/**
 * Get decrypted Google access token from integration
 */
export function getGoogleAccessToken(integration: any): string {
  if (!integration?.access_token) {
    throw new Error('Google authentication required. Please reconnect your account.')
  }
  
  try {
    return decrypt(integration.access_token)
  } catch (error) {
    throw new Error('Failed to decrypt Google access token. Please reconnect your account.')
  }
}

/**
 * Validate Google integration has required access token
 */
export function validateGoogleIntegration(integration: any): void {
  if (!integration) {
    throw new Error('Google integration not found')
  }
  
  if (!integration.access_token) {
    throw new Error('Google authentication required. Please reconnect your account.')
  }
  
  // Accept various Google-related providers since they all use Google OAuth
  const validProviders = [
    'google',
    'google-calendar',
    'google-drive',
    'google-sheets',
    'google-docs',
    'google_calendar', // underscore variant
    'gmail', // Gmail uses Google OAuth
    'youtube' // YouTube uses Google OAuth
  ];

  const isValidProvider = validProviders.some(provider =>
    integration.provider?.toLowerCase() === provider.toLowerCase() ||
    integration.provider?.toLowerCase().startsWith(provider.toLowerCase())
  );

  if (!isValidProvider) {
    logger.error('validateGoogleIntegration: Invalid provider', {
      actualProvider: integration.provider,
      validProviders
    });
    throw new Error(`Invalid integration provider. Expected Google-related provider but got: ${integration.provider}`)
  }
  
  // Note: We're lenient about status since we have a valid access token
  // The main requirement is having an access token, not a specific status
}

/**
 * Make authenticated request to Google API
 */
export async function makeGoogleApiRequest(
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
    const errorData = await response.json().catch(() => ({}))
    throw createGoogleApiError(
      `Google API error: ${response.status} - ${errorData.error?.message || response.statusText}`,
      response.status,
      response
    )
  }

  return response
}

/**
 * Get standard Google API headers
 */
export function getGoogleApiHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Extract file name from Google Drive item
 */
export function getFileName(file: any): string {
  return file.name || file.title || 'Untitled'
}

/**
 * Check if Google Drive item is a folder
 */
export function isGoogleDriveFolder(file: any): boolean {
  return file.mimeType === 'application/vnd.google-apps.folder'
}

/**
 * Check if Google Drive item is a Google Sheets file
 */
export function isGoogleSheetsFile(file: any): boolean {
  return file.mimeType === 'application/vnd.google-apps.spreadsheet'
}

/**
 * Check if Google Drive item is a Google Docs file
 */
export function isGoogleDocsFile(file: any): boolean {
  return file.mimeType === 'application/vnd.google-apps.document'
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: string | number): string {
  const numBytes = typeof bytes === 'string' ? parseInt(bytes) : bytes
  if (isNaN(numBytes)) return 'Unknown size'
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = numBytes
  let unitIndex = 0
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`
}