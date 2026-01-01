/**
 * Google Sheets Integration Utilities
 */

import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { GoogleSheetsIntegration } from './types'
import { decrypt } from '@/lib/security/encryption'

import { logger } from '@/lib/utils/logger'

/**
 * Create authenticated Google Sheets client
 */
export async function createGoogleSheetsClient(integration: GoogleSheetsIntegration) {
  if (!integration.access_token) {
    throw new Error('No access token available')
  }

  const decryptedToken = await decrypt(integration.access_token)
  const decryptedRefreshToken = integration.refresh_token ? await decrypt(integration.refresh_token) : null

  const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google/callback`
  )

  oauth2Client.setCredentials({
    access_token: decryptedToken,
    refresh_token: decryptedRefreshToken,
    token_type: 'Bearer',
    expiry_date: integration.expires_at ? new Date(integration.expires_at).getTime() : undefined
  })

  // Check if token needs refresh
  if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken()
      oauth2Client.setCredentials(credentials)
      // Note: You should update the database with new tokens here
      logger.debug('🔄 Refreshed Google Sheets access token')
    } catch (error) {
      logger.error('Failed to refresh token:', error)
      throw new Error('Authentication expired. Please reconnect your Google account.')
    }
  }

  return google.sheets({ version: 'v4', auth: oauth2Client })
}

/**
 * Create authenticated Google Drive client for listing spreadsheets
 */
export async function createGoogleDriveClient(integration: GoogleSheetsIntegration) {
  if (!integration.access_token) {
    throw new Error('No access token available')
  }

  const decryptedToken = await decrypt(integration.access_token)
  const decryptedRefreshToken = integration.refresh_token ? await decrypt(integration.refresh_token) : null

  const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google/callback`
  )

  oauth2Client.setCredentials({
    access_token: decryptedToken,
    refresh_token: decryptedRefreshToken,
    token_type: 'Bearer',
    expiry_date: integration.expires_at ? new Date(integration.expires_at).getTime() : undefined
  })

  // Check if token needs refresh
  if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken()
      oauth2Client.setCredentials(credentials)
      // Note: You should update the database with new tokens here
      logger.debug('🔄 Refreshed Google Drive access token')
    } catch (error) {
      logger.error('Failed to refresh token:', error)
      throw new Error('Authentication expired. Please reconnect your Google account.')
    }
  }

  return google.drive({ version: 'v3', auth: oauth2Client })
}

/**
 * Convert sheet rows to records format with headers as field names
 */
export function convertRowsToRecords(
  rows: any[][],
  headers?: string[],
  startRowNumber: number = 1
): any[] {
  if (!rows || rows.length === 0) {
    return []
  }

  // If no headers provided, use first row as headers
  const fieldNames = headers || rows[0]?.map((_, index) => `Column ${String.fromCharCode(65 + index)}`) || []
  
  // Skip header row if it exists
  const dataRows = headers ? rows : rows.slice(1)
  
  return dataRows.map((row, index) => {
    const fields: Record<string, any> = {}
    
    fieldNames.forEach((fieldName, colIndex) => {
      fields[fieldName] = row[colIndex] || ''
    })
    
    // Create a label from the first non-empty field
    const label = row.find(cell => cell && cell !== '') || `Row ${startRowNumber + index}`
    
    return {
      id: `row_${startRowNumber + index}`,
      rowNumber: startRowNumber + index,
      fields,
      label: String(label),
      value: `row_${startRowNumber + index}` // For selection
    }
  })
}

/**
 * Parse sheet name from various formats.
 * The sheetName might be:
 * - A plain string: "Sheet1"
 * - A JSON string: "{\"id\":0,\"name\":\"Sheet1\",...}"
 * - An object: { id: 0, name: "Sheet1", ... }
 */
export function parseSheetName(rawSheetName: any): string {
  if (!rawSheetName) {
    return ''
  }

  // If it's an object with a 'name' property, extract it
  if (typeof rawSheetName === 'object' && rawSheetName !== null) {
    return (rawSheetName as any).name || String(rawSheetName)
  }

  // If it's a string, check if it's JSON
  if (typeof rawSheetName === 'string') {
    const trimmed = rawSheetName.trim()
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed)
        return parsed?.name || rawSheetName
      } catch {
        // Not valid JSON, use as-is
        return rawSheetName
      }
    }
    return rawSheetName
  }

  return String(rawSheetName)
}

/**
 * Apply filters to records
 */
export function filterRecords(
  records: any[],
  options: {
    filterField?: string
    filterValue?: any
    searchQuery?: string
  }
): any[] {
  let filtered = [...records]

  // Apply field filter
  if (options.filterField && options.filterValue !== undefined) {
    filtered = filtered.filter(record => {
      const fieldValue = record.fields[options.filterField!]
      return String(fieldValue).toLowerCase() === String(options.filterValue).toLowerCase()
    })
  }

  // Apply search filter
  if (options.searchQuery) {
    const query = options.searchQuery.toLowerCase()
    filtered = filtered.filter(record => {
      return Object.values(record.fields).some(value => 
        String(value).toLowerCase().includes(query)
      )
    })
  }

  return filtered
}