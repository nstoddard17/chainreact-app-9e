import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { decryptToken } from '@/lib/integrations/tokenUtils'

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
}

/**
 * Set up Google Sheets watch for push notifications
 * Since Sheets doesn't have native webhooks, we use Drive API to watch the spreadsheet file
 * and then check for specific changes within the sheet
 */
export async function setupGoogleSheetsWatch(config: GoogleSheetsWatchConfig): Promise<{ channelId: string; resourceId: string; expiration: string; lastRowCount?: number }> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
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
    let accessToken = decryptedAccessToken
    if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
      console.log('Access token expired, refreshing...')
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

    // Get initial sheet data for comparison
    let lastRowCount: number | undefined
    let lastSheetCount: number | undefined
    let sheetData: any = {}

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
            range: `${config.sheetName}!A:A` // Get first column to count actual data rows
          })
          const dataRows = valuesResponse.data.values?.length || 0
          lastRowCount = dataRows
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
      console.warn('Could not get initial sheet data:', err)
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
        address: getGoogleWebhookCallbackUrl(),
        expiration: expiration.getTime().toString(),
        // Store metadata in token
        token: JSON.stringify({
          userId: config.userId,
          integrationId: config.integrationId,
          spreadsheetId: config.spreadsheetId,
          sheetName: config.sheetName,
          triggerType: config.triggerType
        })
      }
    })

    if (!watchResponse.data.resourceId || !watchResponse.data.expiration) {
      throw new Error('Failed to create Google Sheets watch - missing required data')
    }

    console.log('✅ Google Sheets watch created successfully:', {
      channelId,
      resourceId: watchResponse.data.resourceId,
      expiration: new Date(parseInt(watchResponse.data.expiration)).toISOString(),
      spreadsheetId: config.spreadsheetId,
      sheetName: config.sheetName
    })

    // Store the watch details in database for renewal and change tracking
    await supabase.from('google_watch_subscriptions').upsert({
      user_id: config.userId,
      integration_id: config.integrationId,
      provider: 'google-sheets',
      channel_id: channelId,
      resource_id: watchResponse.data.resourceId,
      expiration: new Date(parseInt(watchResponse.data.expiration)).toISOString(),
      metadata: {
        spreadsheetId: config.spreadsheetId,
        sheetName: config.sheetName,
        triggerType: config.triggerType,
        lastRowCount,
        lastSheetCount,
        sheetData
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })

    return {
      channelId,
      resourceId: watchResponse.data.resourceId,
      expiration: new Date(parseInt(watchResponse.data.expiration)).toISOString(),
      lastRowCount
    }
  } catch (error) {
    console.error('Failed to set up Google Sheets watch:', error)
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
      process.env.SUPABASE_SERVICE_ROLE_KEY!
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
      console.log('Google Sheets integration not found - watch may already be stopped')
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
      console.log('Failed to decrypt Google Sheets access token - watch may already be stopped')
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

    console.log('✅ Google Sheets watch stopped successfully')
  } catch (error) {
    console.error('Failed to stop Google Sheets watch:', error)
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
      process.env.SUPABASE_SERVICE_ROLE_KEY!
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
          sheetId: sheet.properties?.sheetId
        })
      }
    }

    // Check for changes in specific sheet
    if (previousMetadata.sheetName) {
      const targetSheet = currentSheets.find(s => s.properties?.title === previousMetadata.sheetName)
      if (targetSheet) {
        // Get current row count
        const valuesResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${previousMetadata.sheetName}!A:Z` // Get all columns
        })

        const currentRows = valuesResponse.data.values || []
        const currentRowCount = currentRows.length

        if (previousMetadata.lastRowCount !== undefined) {
          // New rows detected
          if (currentRowCount > previousMetadata.lastRowCount) {
            const newRows = currentRows.slice(previousMetadata.lastRowCount)
            for (let i = 0; i < newRows.length; i++) {
              changes.push({
                type: 'new_row',
                sheetName: previousMetadata.sheetName,
                rowNumber: previousMetadata.lastRowCount + i + 1,
                data: newRows[i]
              })
            }
          }

          // Updated rows (simplified check - in production, you'd want to compare checksums)
          if (previousMetadata.triggerType === 'updated_row' && currentRowCount === previousMetadata.lastRowCount) {
            changes.push({
              type: 'updated_row',
              sheetName: previousMetadata.sheetName,
              message: 'Sheet was modified but row count unchanged - possible row update'
            })
          }
        }

        // Update metadata for next comparison
        previousMetadata.lastRowCount = currentRowCount
      }
    }

    // Update sheet count
    previousMetadata.lastSheetCount = currentSheets.length

    return {
      changes,
      updatedMetadata: previousMetadata
    }
  } catch (error) {
    console.error('Failed to check Google Sheets changes:', error)
    throw error
  }
}
