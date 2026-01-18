import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { decryptToken } from '@/lib/integrations/tokenUtils'

import { logger } from '@/lib/utils/logger'

function buildSheetRange(sheetName: string, columnRange?: string): string {
  if (!sheetName) return columnRange || 'A:Z'
  const escaped = sheetName.replace(/'/g, "''")
  const base = `'${escaped}'`
  return columnRange ? `${base}!${columnRange}` : base
}

function createRowSignature(row: any[]): string {
  if (!Array.isArray(row)) return ''
  const normalizedCells = row.map((cell) => {
    if (cell === null || cell === undefined) return ''
    if (typeof cell === 'string') return cell.trim()
    return String(cell).trim()
  })
  if (normalizedCells.every((cell) => cell === '')) {
    return ''
  }
  return normalizedCells.join('||')
}

function getGoogleWebhookCallbackUrl(): string {
  const isProduction = process.env.NODE_ENV === 'production'
  const baseUrl = isProduction
    ? process.env.NEXT_PUBLIC_APP_URL
    : process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL || process.env.NEXT_PUBLIC_APP_URL

  if (!baseUrl) {
    throw new Error('Missing webhook base URL. Set NEXT_PUBLIC_APP_URL (and NEXT_PUBLIC_WEBHOOK_HTTPS_URL in development).')
  }

  return `${baseUrl.replace(/\/$/, '')}/api/webhooks/google`
}

interface GoogleSheetsWatchConfig {
  userId: string
  integrationId: string
  spreadsheetId: string
  sheetName?: string // Optional: specific sheet to watch
  triggerType: 'new_row' | 'updated_row' | 'new_worksheet'
  webhookUrl?: string
}

/**
 * Set up Google Sheets watch for push notifications
 * Since Sheets doesn't have native webhooks, we use Drive API to watch the spreadsheet file
 * and then check for specific changes within the sheet
 */
export async function setupGoogleSheetsWatch(config: GoogleSheetsWatchConfig): Promise<{
  channelId: string
  resourceId: string
  expiration: string
  lastRowCount?: number
  lastSheetCount?: number
  pageToken: string
  sheetData?: Record<string, any>
  rowSignatures?: Record<string, string>
}> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

    // Get the integration to fetch access token
    const { data: integration, error } = await supabase
      .from('integrations')
      .select('access_token, refresh_token, expires_at')
      .eq('id', config.integrationId)
      .eq('user_id', config.userId)
      .eq('provider', 'google-sheets')
      .single()

    if (error || !integration) {
      throw new Error('Google Sheets integration not found')
    }

    // Decrypt the access token
    const decryptedAccessToken = await decryptToken(integration.access_token)
    if (!decryptedAccessToken) {
      throw new Error('Failed to decrypt Google Sheets access token')
    }

    // Check if token needs refresh
    const accessToken = decryptedAccessToken
    if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
      logger.debug('Access token expired, refreshing...')
      // TODO: Implement token refresh for Google Sheets
      // For now, throw an error
      throw new Error('Google Sheets token expired - please reconnect the integration')
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )
    oauth2Client.setCredentials({ access_token: accessToken })

    // Create Drive and Sheets clients
    const drive = google.drive({ version: 'v3', auth: oauth2Client })
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client })

    // Capture a starting page token so Drive change polling can advance
    const startPageTokenResponse = await drive.changes.getStartPageToken({
      supportsAllDrives: true,
      supportsTeamDrives: true
    })
    const startPageToken = startPageTokenResponse.data.startPageToken
    if (!startPageToken) {
      throw new Error('Failed to retrieve Drive start page token for Sheets watch')
    }

    // Get initial sheet data for comparison
    let lastRowCount: number | undefined
    let lastSheetCount: number | undefined
    const sheetData: any = {}
    let initialRowSignatures: Record<string, string> | undefined

    try {
      // Get spreadsheet metadata
      const spreadsheetResponse = await sheets.spreadsheets.get({
        spreadsheetId: config.spreadsheetId,
        includeGridData: false
      })

      const sheetsList = spreadsheetResponse.data.sheets || []
      lastSheetCount = sheetsList.length

      // If watching a specific sheet, get its row count
      if (config.sheetName) {
        const targetSheet = sheetsList.find(s => s.properties?.title === config.sheetName)
        if (targetSheet) {
          const rowCount = targetSheet.properties?.gridProperties?.rowCount || 0
          lastRowCount = rowCount

          // Get actual data rows (excluding headers)
          const valuesResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: config.spreadsheetId,
            range: buildSheetRange(config.sheetName),
            majorDimension: 'ROWS'
          })
          const dataRows = valuesResponse.data.values || []
          lastRowCount = dataRows.length

          initialRowSignatures = {}
          dataRows.forEach((row, index) => {
            const signature = createRowSignature(row)
            if (signature) {
              initialRowSignatures![String(index + 1)] = signature
            }
          })
        }
      }

      // Store sheet checksums for change detection
      for (const sheet of sheetsList) {
        if (sheet.properties?.sheetId) {
          sheetData[sheet.properties.sheetId] = {
            title: sheet.properties.title,
            rowCount: sheet.properties.gridProperties?.rowCount || 0,
            columnCount: sheet.properties.gridProperties?.columnCount || 0
          }
        }
      }
    } catch (err) {
      logger.warn('Could not get initial sheet data:', err)
    }

    // Generate a unique channel ID
    const channelId = `sheets-${config.userId}-${config.spreadsheetId}-${Date.now()}`

    // Calculate expiration (maximum 1 week from now)
    const expiration = new Date()
    expiration.setDate(expiration.getDate() + 7)

    // Use Drive API to watch the spreadsheet file for changes
    const watchResponse = await drive.files.watch({
      fileId: config.spreadsheetId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: config.webhookUrl || getGoogleWebhookCallbackUrl(),
        expiration: expiration.getTime().toString(),
        // Store metadata in token
        token: JSON.stringify({
          userId: config.userId,
          integrationId: config.integrationId,
          provider: 'google-sheets',
          spreadsheetId: config.spreadsheetId,
          sheetName: config.sheetName,
          triggerType: config.triggerType
        })
      }
    })

    if (!watchResponse.data.resourceId || !watchResponse.data.expiration) {
      throw new Error('Failed to create Google Sheets watch - missing required data')
    }

    logger.debug('✅ Google Sheets watch created successfully:', {
      channelId,
      resourceId: watchResponse.data.resourceId,
      expiration: new Date(parseInt(watchResponse.data.expiration)).toISOString(),
      spreadsheetId: config.spreadsheetId,
      sheetName: config.sheetName
    })

    // Store the watch details in database for renewal and change tracking
    const { error: watchInsertError } = await supabase.from('google_watch_subscriptions').upsert({
      user_id: config.userId,
      integration_id: config.integrationId,
      provider: 'google-sheets',
      channel_id: channelId,
      resource_id: watchResponse.data.resourceId,
      expiration: new Date(parseInt(watchResponse.data.expiration)).toISOString(),
      page_token: startPageToken,
      metadata: {
        spreadsheetId: config.spreadsheetId,
        sheetName: config.sheetName,
        triggerType: config.triggerType,
        lastRowCount,
        lastSheetCount,
        sheetData,
        rowSignatures: initialRowSignatures || {}
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })

    if (watchInsertError) {
      logger.error('Failed to store Google Sheets watch metadata:', {
        error: watchInsertError,
        channelId,
        spreadsheetId: config.spreadsheetId,
        sheetName: config.sheetName,
        triggerType: config.triggerType
      })
      // Critical failure - without stored metadata, we can't process incoming webhooks
      throw new Error(`Failed to store watch metadata: ${watchInsertError.message}`)
    }

    logger.debug('📦 Stored Google Sheets watch metadata', {
      userId: config.userId,
      integrationId: config.integrationId,
      metadata: {
        spreadsheetId: config.spreadsheetId,
        sheetName: config.sheetName,
        triggerType: config.triggerType,
        lastRowCount,
        lastSheetCount
      }
    })

    return {
      channelId,
      resourceId: watchResponse.data.resourceId,
      expiration: new Date(parseInt(watchResponse.data.expiration)).toISOString(),
      lastRowCount,
      lastSheetCount,
      pageToken: startPageToken,
      sheetData,
      rowSignatures: initialRowSignatures || {}
    }
  } catch (error) {
    logger.error('Failed to set up Google Sheets watch:', error)
    throw error
  }
}

/**
 * Stop Google Sheets watch
 */
export async function stopGoogleSheetsWatch(userId: string, integrationId: string, channelId: string, resourceId: string): Promise<void> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

    // Get the integration to fetch access token
    const { data: integration, error } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('id', integrationId)
      .eq('user_id', userId)
      .eq('provider', 'google-sheets')
      .single()

    if (error || !integration) {
      logger.debug('Google Sheets integration not found - watch may already be stopped')
      return
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )

    // Decrypt the access token first
    const decryptedAccessToken = await decryptToken(integration.access_token)
    if (!decryptedAccessToken) {
      logger.debug('Failed to decrypt Google Sheets access token - watch may already be stopped')
      return
    }
    oauth2Client.setCredentials({ access_token: decryptedAccessToken })

    // Create Drive client (since we use Drive API for watching)
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    // Stop the watch
    await drive.channels.stop({
      requestBody: {
        id: channelId,
        resourceId: resourceId
      }
    })

    // Remove from database
    await supabase
      .from('google_watch_subscriptions')
      .delete()
      .eq('channel_id', channelId)
      .eq('user_id', userId)

    logger.debug('✅ Google Sheets watch stopped successfully')
  } catch (error) {
    logger.error('Failed to stop Google Sheets watch:', error)
    // Don't throw - watch might already be stopped
  }
}

/**
 * Check for specific sheet changes (new rows, updated rows, new worksheets)
 */
export async function checkGoogleSheetsChanges(
  userId: string,
  integrationId: string,
  spreadsheetId: string,
  previousMetadata: any
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

    // Get the integration to fetch access token
    const { data: integration, error } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('id', integrationId)
      .eq('user_id', userId)
      .eq('provider', 'google-sheets')
      .single()

    if (error || !integration) {
      throw new Error('Google Sheets integration not found')
    }

    // Decrypt and set up OAuth
    const decryptedAccessToken = await decryptToken(integration.access_token)
    if (!decryptedAccessToken) {
      throw new Error('Failed to decrypt Google Sheets access token')
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )
    oauth2Client.setCredentials({ access_token: decryptedAccessToken })

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client })

    // Get current spreadsheet state
    const spreadsheetResponse = await sheets.spreadsheets.get({
      spreadsheetId,
      includeGridData: false
    })

    const currentSheets = spreadsheetResponse.data.sheets || []
    const changes: any[] = []

    // Check for new worksheets
    if (previousMetadata.lastSheetCount && currentSheets.length > previousMetadata.lastSheetCount) {
      const newSheets = currentSheets.slice(previousMetadata.lastSheetCount)
      for (const sheet of newSheets) {
        changes.push({
          type: 'new_worksheet',
          sheetName: sheet.properties?.title,
          sheetId: sheet.properties?.sheetId,
          spreadsheetId,
          timestamp: new Date().toISOString()
        })
      }
    }

    // Check for changes in specific sheet
    const previousSignatureCount = previousMetadata?.rowSignatures
      ? Object.keys(previousMetadata.rowSignatures).length
      : 0

    logger.debug('[Google Sheets] Change detection context', {
      spreadsheetId,
      sheetName: previousMetadata.sheetName,
      lastRowCount: previousMetadata.lastRowCount,
      lastSheetCount: previousMetadata.lastSheetCount,
      signatureCount: previousSignatureCount
    })

    if (previousMetadata.sheetName) {
      const targetSheet = currentSheets.find(s => s.properties?.title === previousMetadata.sheetName)
      if (targetSheet) {
        // Get current row count
        const valuesResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: buildSheetRange(previousMetadata.sheetName),
          majorDimension: 'ROWS'
        })

        const currentRows = valuesResponse.data.values || []
        const currentRowCount = currentRows.length
        const previousRowCount = previousMetadata.lastRowCount ?? 0
        const previousRowSignatures: Record<string, string> = previousMetadata.rowSignatures || {}
        const currentRowSignatures: Record<string, string> = {}

        logger.debug('[Google Sheets] Row count comparison', {
          previousRowCount,
          currentRowCount
        })

        const newRowIndices: number[] = []
        const updatedRowIndices: number[] = []

        currentRows.forEach((row, index) => {
          const rowNumber = index + 1
          const signature = createRowSignature(row)
          currentRowSignatures[String(rowNumber)] = signature

          const previousSignature = previousRowSignatures[String(rowNumber)] || ''
          const wasPreviouslyEmpty = !previousSignature
          const isCurrentlyEmpty = !signature
          const isBeyondPreviousCount = rowNumber > previousRowCount
          const signaturesDiffer = previousSignature !== signature

          if (rowNumber <= 10 || rowNumber >= Math.max(previousRowCount - 3, 1)) {
            logger.debug('[Google Sheets] Row snapshot', {
              rowNumber,
              signature,
              previousSignature,
              wasPreviouslyEmpty,
              isCurrentlyEmpty,
              values: row
            })
          }

          if (isBeyondPreviousCount) {
            if (!isCurrentlyEmpty) {
              newRowIndices.push(index)
            }
            return
          }

          if (wasPreviouslyEmpty && !isCurrentlyEmpty) {
            newRowIndices.push(index)
            return
          }

          if (signaturesDiffer) {
            logger.debug('[Google Sheets] Row signature change detected', {
              sheetName: previousMetadata.sheetName,
              rowNumber,
              wasPreviouslyEmpty,
              isCurrentlyEmpty,
              previousSignature,
              signature
            })
            updatedRowIndices.push(index)
          }
        })

        const timestamp = new Date().toISOString()

        // Extract headers from the first row for filtering support
        const headers = currentRows.length > 0 ? currentRows[0] : []

        for (const rowIndex of newRowIndices) {
          const rowNumber = rowIndex + 1
          changes.push({
            type: 'new_row',
            sheetName: previousMetadata.sheetName,
            spreadsheetId,
            rowNumber,
            rowIndex,
            data: currentRows[rowIndex],
            values: currentRows[rowIndex],
            headers, // Include headers for filtering
            timestamp
          })
        }

        for (const rowIndex of updatedRowIndices) {
          const rowNumber = rowIndex + 1
          changes.push({
            type: 'updated_row',
            sheetName: previousMetadata.sheetName,
            spreadsheetId,
            rowNumber,
            rowIndex,
            data: currentRows[rowIndex] || [],
            values: currentRows[rowIndex] || [],
            headers, // Include headers for filtering
            timestamp,
            message: 'Detected updated row based on signature diff'
          })
        }

        // Update metadata for next comparison
        previousMetadata.lastRowCount = currentRowCount
        previousMetadata.rowSignatures = currentRowSignatures
      }
    }

    // Update sheet count
    previousMetadata.lastSheetCount = currentSheets.length
    previousMetadata.spreadsheetId = spreadsheetId

    return {
      changes,
      updatedMetadata: previousMetadata
    }
  } catch (error) {
    logger.error('Failed to check Google Sheets changes:', error)
    throw error
  }
}
