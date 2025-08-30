/**
 * Google Sheets Records Handler
 * Fetches rows from a Google Sheet and formats them as records
 */

import { GoogleSheetsIntegration, GoogleSheetsRecord, GoogleSheetsDataHandler, GoogleSheetsHandlerOptions } from '../types'
import { createGoogleSheetsClient, convertRowsToRecords, filterRecords } from '../utils'

export const getGoogleSheetsRecords: GoogleSheetsDataHandler<GoogleSheetsRecord[]> = async (
  integration: GoogleSheetsIntegration,
  options: GoogleSheetsHandlerOptions = {}
): Promise<GoogleSheetsRecord[]> => {
  const { 
    spreadsheetId, 
    sheetName, 
    maxRows = 100,
    startRow = 1,
    endRow,
    filterField,
    filterValue,
    searchQuery,
    includeHeaders = true
  } = options
  
  console.log("🔍 Google Sheets records fetcher called with:", {
    integrationId: integration.id,
    spreadsheetId,
    sheetName,
    maxRows,
    hasToken: !!integration.access_token
  })
  
  try {
    if (!spreadsheetId) {
      throw new Error('Spreadsheet ID is required for fetching records')
    }
    
    if (!sheetName) {
      throw new Error('Sheet name is required for fetching records')
    }
    
    const sheets = await createGoogleSheetsClient(integration)
    
    console.log('🔍 Fetching Google Sheets data...')
    
    // Calculate the range to fetch
    const finalEndRow = endRow || startRow + maxRows - 1
    const range = `${sheetName}!A${startRow}:Z${finalEndRow}`
    
    // Fetch the data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING'
    })
    
    const rows = response.data.values || []
    
    if (rows.length === 0) {
      console.log('📋 No data found in the specified range')
      return []
    }
    
    // Get headers if needed
    let headers: string[] | undefined
    let dataRows = rows
    
    if (includeHeaders && startRow === 1) {
      // First row is headers
      headers = rows[0].map((header, index) => 
        header || `Column ${String.fromCharCode(65 + index)}`
      )
      dataRows = rows.slice(1)
    } else if (includeHeaders) {
      // Need to fetch headers separately
      const headerResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A1:Z1`,
        valueRenderOption: 'FORMATTED_VALUE'
      })
      
      if (headerResponse.data.values && headerResponse.data.values[0]) {
        headers = headerResponse.data.values[0].map((header, index) => 
          header || `Column ${String.fromCharCode(65 + index)}`
        )
      }
    }
    
    // Convert rows to records format
    const records = convertRowsToRecords(
      dataRows,
      headers,
      includeHeaders && startRow === 1 ? 2 : startRow
    )
    
    // Apply filters if specified
    const filteredRecords = filterRecords(records, {
      filterField,
      filterValue,
      searchQuery
    })
    
    console.log(`✅ Google Sheets records fetched successfully: ${filteredRecords.length} records`)
    return filteredRecords
    
  } catch (error: any) {
    console.error("Error fetching Google Sheets records:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Google Sheets authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Google Sheets API rate limit exceeded. Please try again later.')
    }
    
    if (error.code === 404) {
      throw new Error('Spreadsheet or sheet not found. Please check the ID and sheet name.')
    }
    
    throw new Error(error.message || "Error fetching Google Sheets records")
  }
}