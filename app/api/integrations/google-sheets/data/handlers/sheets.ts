/**
 * Google Sheets Sheets Handler
 */

import { GoogleSheetsIntegration, GoogleSheetsSheet, GoogleSheetsDataHandler, GoogleSheetsHandlerOptions } from '../types'
import { createGoogleSheetsClient } from '../utils'

export const getGoogleSheetsSheets: GoogleSheetsDataHandler<GoogleSheetsSheet[]> = async (
  integration: GoogleSheetsIntegration,
  options: GoogleSheetsHandlerOptions = {}
): Promise<GoogleSheetsSheet[]> => {
  const { spreadsheetId } = options
  
  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID is required')
  }
  
  try {
    const sheets = await createGoogleSheetsClient(integration)
    
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))'
    })
    
    return (response.data.sheets || []).map(sheet => ({
      id: sheet.properties?.sheetId || 0,
      name: sheet.properties?.title || 'Sheet',
      index: sheet.properties?.index || 0,
      rowCount: sheet.properties?.gridProperties?.rowCount || 0,
      columnCount: sheet.properties?.gridProperties?.columnCount || 0
    }))
  } catch (error: any) {
    console.error("Error fetching sheets:", error)
    throw new Error(error.message || "Error fetching sheets")
  }
}