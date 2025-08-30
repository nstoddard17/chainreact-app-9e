/**
 * Google Sheets Spreadsheets Handler
 */

import { GoogleSheetsIntegration, GoogleSheetsSpreadsheet, GoogleSheetsDataHandler } from '../types'
import { createGoogleDriveClient } from '../utils'

export const getGoogleSheetsSpreadsheets: GoogleSheetsDataHandler<GoogleSheetsSpreadsheet[]> = async (
  integration: GoogleSheetsIntegration
): Promise<GoogleSheetsSpreadsheet[]> => {
  try {
    const drive = await createGoogleDriveClient(integration)
    
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet'",
      fields: 'files(id, name, createdTime, modifiedTime, webViewLink)',
      orderBy: 'modifiedTime desc',
      pageSize: 100
    })
    
    return (response.data.files || []).map(file => ({
      id: file.id!,
      name: file.name!,
      createdTime: file.createdTime || undefined,
      modifiedTime: file.modifiedTime || undefined,
      webViewLink: file.webViewLink || undefined
    }))
  } catch (error: any) {
    console.error("Error fetching spreadsheets:", error)
    throw new Error(error.message || "Error fetching spreadsheets")
  }
}