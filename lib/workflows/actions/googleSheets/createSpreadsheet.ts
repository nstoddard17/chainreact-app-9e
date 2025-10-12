import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { google } from 'googleapis'

import { logger } from '@/lib/utils/logger'

/**
 * Create a new Google Sheets spreadsheet
 */
export async function createGoogleSpreadsheet(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const {
      title = 'New Spreadsheet',
      sheetNames = ['Sheet1'],
      folder,
      locale = 'en_US',
      timeZone = 'America/New_York'
    } = resolvedConfig

    // Get access token
    const accessToken = await getDecryptedAccessToken(userId, "google-sheets")
    
    // Initialize Sheets API
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    // Create spreadsheet with sheets
    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title,
          locale,
          timeZone
        },
        sheets: sheetNames.map((name: string, index: number) => ({
          properties: {
            sheetId: index,
            title: name,
            index: index,
            gridProperties: {
              rowCount: 1000,
              columnCount: 26
            }
          }
        }))
      }
    })

    if (!spreadsheet.data.spreadsheetId) {
      throw new Error('Failed to create spreadsheet - no ID returned')
    }

    // Move to folder if specified
    if (folder) {
      try {
        await drive.files.update({
          fileId: spreadsheet.data.spreadsheetId,
          addParents: folder,
          fields: 'id, parents'
        })
      } catch (error) {
        logger.warn('Failed to move spreadsheet to folder:', error)
        // Don't fail the entire operation if folder move fails
      }
    }

    return {
      type: 'google_sheets_create_spreadsheet',
      status: 'success',
      data: {
        spreadsheetId: spreadsheet.data.spreadsheetId,
        spreadsheetUrl: spreadsheet.data.spreadsheetUrl,
        title: spreadsheet.data.properties?.title,
        sheets: spreadsheet.data.sheets?.map(sheet => ({
          sheetId: sheet.properties?.sheetId,
          title: sheet.properties?.title
        }))
      }
    }

  } catch (error: any) {
    logger.error('Create Google Spreadsheet error:', error)
    return {
      type: 'google_sheets_create_spreadsheet',
      status: 'error',
      error: error.message || 'Failed to create spreadsheet'
    }
  }
}