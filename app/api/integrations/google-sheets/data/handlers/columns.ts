/**
 * Google Sheets Columns Handler
 */

import { GoogleSheetsIntegration, GoogleSheetsDataHandler, GoogleSheetsHandlerOptions } from '../types'
import { createGoogleSheetsClient } from '../utils'

export const getGoogleSheetsColumns: GoogleSheetsDataHandler<string[]> = async (
  integration: GoogleSheetsIntegration,
  options: GoogleSheetsHandlerOptions = {}
): Promise<string[]> => {
  const { spreadsheetId, sheetName } = options
  
  if (!spreadsheetId || !sheetName) {
    throw new Error('Spreadsheet ID and sheet name are required')
  }
  
  try {
    const sheets = await createGoogleSheetsClient(integration)
    
    // Fetch the first row (headers)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!1:1`,
      valueRenderOption: 'FORMATTED_VALUE'
    })
    
    const headers = response.data.values?.[0] || []
    
    // Return headers or generate column letters if no headers
    if (headers.length > 0) {
      return headers.map((header, index) => 
        header || `Column ${String.fromCharCode(65 + index)}`
      )
    }
    
    // If no data, return default columns A-Z
    return Array.from({ length: 26 }, (_, i) => 
      `Column ${String.fromCharCode(65 + i)}`
    )
  } catch (error: any) {
    console.error("Error fetching columns:", error)
    throw new Error(error.message || "Error fetching columns")
  }
}