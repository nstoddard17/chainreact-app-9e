/**
 * Google Sheets Handlers
 */

import { GoogleIntegration, GoogleSpreadsheet, GoogleSheet, GoogleSheetPreview, GoogleSheetData, GoogleDataHandler } from '../types'
import { validateGoogleIntegration, makeGoogleApiRequest } from '../utils'

/**
 * Fetch Google Sheets spreadsheets for the authenticated user
 */
export const getGoogleSheetsSpreadsheets: GoogleDataHandler<GoogleSpreadsheet> = async (integration: GoogleIntegration) => {
  try {
    validateGoogleIntegration(integration)
    console.log("📊 [Google Sheets] Fetching spreadsheets")

    const response = await makeGoogleApiRequest(
      "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet' and trashed=false&pageSize=100&fields=files(id,name,createdTime,modifiedTime,webViewLink,owners,shared)",
      integration.access_token
    )

    const data = await response.json()
    
    const spreadsheets = (data.files || []).map((file: any): GoogleSpreadsheet => ({
      id: file.id,
      name: file.name,
      value: file.id,
      url: file.webViewLink,
      created_time: file.createdTime,
      modified_time: file.modifiedTime,
      owners: file.owners,
      shared: file.shared,
      mime_type: 'application/vnd.google-apps.spreadsheet'
    }))

    console.log(`✅ [Google Sheets] Retrieved ${spreadsheets.length} spreadsheets`)
    return spreadsheets

  } catch (error: any) {
    console.error("❌ [Google Sheets] Error fetching spreadsheets:", error)
    throw error
  }
}

/**
 * Fetch sheets within a specific Google Spreadsheet
 */
export const getGoogleSheetsSheets: GoogleDataHandler<GoogleSheet> = async (integration: GoogleIntegration, options?: any) => {
  try {
    validateGoogleIntegration(integration)
    
    const { spreadsheetId } = options || {}
    if (!spreadsheetId) {
      throw new Error("Spreadsheet ID is required")
    }

    console.log(`📊 [Google Sheets] Fetching sheets for spreadsheet: ${spreadsheetId}`)

    const response = await makeGoogleApiRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title,sheetType,gridProperties))`,
      integration.access_token
    )

    const data = await response.json()
    
    const sheets = (data.sheets || []).map((sheet: any): GoogleSheet => ({
      id: sheet.properties.sheetId,
      name: sheet.properties.title,
      value: sheet.properties.title,
      sheet_id: sheet.properties.sheetId,
      sheet_type: sheet.properties.sheetType,
      grid_properties: sheet.properties.gridProperties
    }))

    console.log(`✅ [Google Sheets] Retrieved ${sheets.length} sheets`)
    return sheets

  } catch (error: any) {
    console.error("❌ [Google Sheets] Error fetching sheets:", error)
    throw error
  }
}

/**
 * Fetch sheet preview (first 10 rows) for a specific Google Spreadsheet sheet
 */
export const getGoogleSheetsSheetPreview: GoogleDataHandler<GoogleSheetPreview> = async (integration: GoogleIntegration, options?: any) => {
  try {
    validateGoogleIntegration(integration)
    
    const { spreadsheetId, sheetName } = options || {}
    if (!spreadsheetId || !sheetName) {
      throw new Error("Spreadsheet ID and sheet name are required to fetch sheet preview")
    }

    console.log(`📊 [Google Sheets] Fetching sheet preview for: ${spreadsheetId}/${sheetName}`)

    // Get the first 10 rows to show structure and sample data
    const response = await makeGoogleApiRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:10?majorDimension=ROWS`,
      integration.access_token
    )

    const data = await response.json()
    const rows = data.values || []
    
    // Extract headers (first row) and sample data
    const headers = rows.length > 0 ? rows[0] : []
    const sampleData = rows.slice(1, 6) // Get up to 5 sample rows
    
    const preview: GoogleSheetPreview = {
      headers: headers.map((header: string, index: number) => ({
        column: String.fromCharCode(65 + index), // A, B, C, etc.
        name: header || `Column ${index + 1}`,
        index: index,
      })),
      sampleData: sampleData,
      totalRows: rows.length,
      hasHeaders: headers.length > 0 && headers.some((h: string) => h && h.trim() !== ''),
    }

    console.log(`✅ [Google Sheets] Retrieved sheet preview with ${headers.length} headers`)
    return [preview]

  } catch (error: any) {
    console.error("❌ [Google Sheets] Error fetching sheet preview:", error)
    throw error
  }
}

/**
 * Fetch full sheet data (up to 1000 rows) for a specific Google Spreadsheet sheet
 */
export const getGoogleSheetsSheetData: GoogleDataHandler<GoogleSheetData> = async (integration: GoogleIntegration, options?: any) => {
  try {
    validateGoogleIntegration(integration)
    
    const { spreadsheetId, sheetName } = options || {}
    if (!spreadsheetId || !sheetName) {
      throw new Error("Spreadsheet ID and sheet name are required to fetch sheet data")
    }

    console.log(`📊 [Google Sheets] Fetching sheet data for: ${spreadsheetId}/${sheetName}`)

    // Get all rows from the sheet (limit to first 1000 rows for performance)
    const response = await makeGoogleApiRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1000?majorDimension=ROWS`,
      integration.access_token
    )

    const data = await response.json()
    const rows = data.values || []
    
    if (rows.length === 0) {
      const emptyData: GoogleSheetData = { headers: [], data: [], totalRows: 0 }
      return [emptyData]
    }

    // Extract headers (first row) and data rows
    const headers = rows[0] || []
    const dataRows = rows.slice(1)
    
    const sheetData: GoogleSheetData = {
      headers: headers.map((header: string, index: number) => ({
        column: String.fromCharCode(65 + index), // A, B, C, etc.
        name: header || `Column ${index + 1}`,
        index: index,
      })),
      data: dataRows.map((row: any[], index: number) => ({
        rowIndex: index + 2, // +2 because we skip header row and convert to 1-based indexing
        values: row,
        // Add a preview of the row for easy identification
        preview: row.slice(0, 3).join(" • ") || `Row ${index + 2}`
      })),
      totalRows: dataRows.length,
    }

    console.log(`✅ [Google Sheets] Retrieved sheet data with ${dataRows.length} rows`)
    return [sheetData]

  } catch (error: any) {
    console.error("❌ [Google Sheets] Error fetching sheet data:", error)
    throw error
  }
}