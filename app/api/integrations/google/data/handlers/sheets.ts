/**
 * Google Sheets Handlers
 */

import { GoogleIntegration, GoogleSpreadsheet, GoogleSheet, GoogleSheetPreview, GoogleSheetData, GoogleDataHandler } from '../types'

// Enhanced types for new functionality
interface GoogleSheetColumn {
  id: string
  name: string
  value: string
  letter: string
  index: number
  dataType: string
  hasData: boolean
  sampleValues: string[]
}

interface GoogleSheetEnhancedPreview {
  headers: GoogleSheetColumn[]
  sampleData: any[][]
  totalRows: number
  totalColumns: number
  hasHeaders: boolean
  dataTypes: Record<string, string>
  columnStats: Record<string, any>
}
import { validateGoogleIntegration, makeGoogleApiRequest, getGoogleAccessToken } from '../utils'

/**
 * Fetch Google Sheets spreadsheets for the authenticated user
 */
export const getGoogleSheetsSpreadsheets: GoogleDataHandler<GoogleSpreadsheet> = async (integration: GoogleIntegration) => {
  try {
    validateGoogleIntegration(integration)
    console.log("📊 [Google Sheets] Fetching spreadsheets")

    const accessToken = getGoogleAccessToken(integration)
    const response = await makeGoogleApiRequest(
      "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet' and trashed=false&pageSize=100&fields=files(id,name,createdTime,modifiedTime,webViewLink,owners,shared)",
      accessToken
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

    const accessToken = getGoogleAccessToken(integration)
    const response = await makeGoogleApiRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title,sheetType,gridProperties))`,
      accessToken
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
    const accessToken = getGoogleAccessToken(integration)
    const response = await makeGoogleApiRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:10?majorDimension=ROWS`,
      accessToken
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
    const accessToken = getGoogleAccessToken(integration)
    const response = await makeGoogleApiRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1000?majorDimension=ROWS`,
      accessToken
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

/**
 * Fetch column information for a specific Google Spreadsheet sheet
 */
export const getGoogleSheetsColumns: GoogleDataHandler<GoogleSheetColumn> = async (integration: GoogleIntegration, options?: any) => {
  try {
    validateGoogleIntegration(integration)
    
    const { spreadsheetId, sheetName } = options || {}
    if (!spreadsheetId || !sheetName) {
      throw new Error("Spreadsheet ID and sheet name are required to fetch columns")
    }

    console.log(`📊 [Google Sheets] Fetching columns for: ${spreadsheetId}/${sheetName}`)

    const accessToken = getGoogleAccessToken(integration)
    
    // Get sheet metadata and sample data to determine columns
    const [metadataResponse, dataResponse] = await Promise.all([
      makeGoogleApiRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=true&ranges=${encodeURIComponent(sheetName)}!1:10`,
        accessToken
      ),
      makeGoogleApiRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:10?majorDimension=ROWS`,
        accessToken
      )
    ])

    const metadata = await metadataResponse.json()
    const data = await dataResponse.json()
    
    const sheet = metadata.sheets?.[0]
    const rows = data.values || []
    const headers = rows.length > 0 ? rows[0] : []
    const sampleRows = rows.slice(1, 6) // Get 5 sample rows for analysis

    // Generate column information
    const columns: GoogleSheetColumn[] = []
    const maxColumns = Math.max(headers.length, sheet?.data?.[0]?.rowData?.[0]?.values?.length || 0, 26)

    for (let i = 0; i < maxColumns; i++) {
      const letter = String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '')
      const headerValue = headers[i] || `Column ${letter}`
      const sampleValues = sampleRows.map(row => row[i]).filter(Boolean).slice(0, 3)
      
      // Analyze data type from sample values
      let dataType = 'text'
      if (sampleValues.length > 0) {
        const numericCount = sampleValues.filter(val => !isNaN(val) && !isNaN(parseFloat(val))).length
        const dateCount = sampleValues.filter(val => !isNaN(Date.parse(val))).length
        
        if (numericCount / sampleValues.length > 0.5) {
          dataType = 'number'
        } else if (dateCount / sampleValues.length > 0.5) {
          dataType = 'date'
        }
      }

      columns.push({
        id: letter,
        name: headerValue,
        value: letter,
        letter: letter,
        index: i,
        dataType: dataType,
        hasData: sampleValues.length > 0,
        sampleValues: sampleValues
      })
    }

    console.log(`✅ [Google Sheets] Retrieved ${columns.length} columns`)
    return columns

  } catch (error: any) {
    console.error("❌ [Google Sheets] Error fetching columns:", error)
    throw error
  }
}

/**
 * Fetch unique values from a specific column for filtering
 */
export const getGoogleSheetsColumnValues: GoogleDataHandler<{ id: string; name: string; value: string }> = async (integration: GoogleIntegration, options?: any) => {
  try {
    validateGoogleIntegration(integration)
    
    const { spreadsheetId, sheetName, filterColumn } = options || {}
    if (!spreadsheetId || !sheetName || !filterColumn) {
      throw new Error("Spreadsheet ID, sheet name, and column are required to fetch column values")
    }

    console.log(`📊 [Google Sheets] Fetching column values for: ${spreadsheetId}/${sheetName}/${filterColumn}`)

    const accessToken = getGoogleAccessToken(integration)
    
    // Get the column data
    const response = await makeGoogleApiRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?majorDimension=COLUMNS`,
      accessToken
    )

    const data = await response.json()
    const columns = data.values || []
    
    // Find the column index (either by letter or header name)
    let columnIndex = -1
    let columnData: string[] = []
    
    // Check if filterColumn is a letter (A, B, C, etc.)
    if (/^[A-Z]+$/i.test(filterColumn)) {
      // Convert letter to index (A=0, B=1, etc.)
      columnIndex = filterColumn.toUpperCase().charCodeAt(0) - 65
      if (filterColumn.length > 1) {
        columnIndex = (columnIndex + 1) * 26 + filterColumn.charCodeAt(1) - 65
      }
      columnData = columns[columnIndex] || []
    } else {
      // Search by header name
      const headers = columns.map(col => col[0])
      columnIndex = headers.findIndex(header => header === filterColumn)
      if (columnIndex >= 0) {
        columnData = columns[columnIndex] || []
      }
    }

    if (columnData.length === 0) {
      return []
    }

    // Get unique values from the column (skip header row)
    const uniqueValues = new Set(columnData.slice(1).filter(val => val !== undefined && val !== null && val !== ''))
    
    // Convert to option format and sort
    const values = Array.from(uniqueValues)
      .sort((a, b) => {
        // Try numeric sort first
        const numA = parseFloat(a)
        const numB = parseFloat(b)
        if (!isNaN(numA) && !isNaN(numB)) {
          return numA - numB
        }
        // Fall back to string sort
        return a.localeCompare(b)
      })
      .slice(0, 100) // Limit to 100 values for performance
      .map(value => ({
        id: value,
        name: value,
        value: value
      }))

    console.log(`✅ [Google Sheets] Retrieved ${values.length} unique values from column ${filterColumn}`)
    return values

  } catch (error: any) {
    console.error("❌ [Google Sheets] Error fetching column values:", error)
    throw error
  }
}

/**
 * Fetch enhanced preview with detailed analysis for a specific Google Spreadsheet sheet
 */
export const getGoogleSheetsEnhancedPreview: GoogleDataHandler<GoogleSheetEnhancedPreview> = async (integration: GoogleIntegration, options?: any) => {
  try {
    validateGoogleIntegration(integration)
    
    const { spreadsheetId, sheetName, previewRows = 10 } = options || {}
    if (!spreadsheetId || !sheetName) {
      throw new Error("Spreadsheet ID and sheet name are required for enhanced preview")
    }

    console.log(`📊 [Google Sheets] Fetching enhanced preview for: ${spreadsheetId}/${sheetName}`)

    const accessToken = getGoogleAccessToken(integration)

    // Get more comprehensive data for analysis
    const response = await makeGoogleApiRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:${Math.min(previewRows + 1, 100)}?majorDimension=ROWS`,
      accessToken
    )

    const data = await response.json()
    const rows = data.values || []
    
    if (rows.length === 0) {
      const emptyPreview: GoogleSheetEnhancedPreview = {
        headers: [],
        sampleData: [],
        totalRows: 0,
        totalColumns: 0,
        hasHeaders: false,
        dataTypes: {},
        columnStats: {}
      }
      return [emptyPreview]
    }

    const headers = rows[0] || []
    const dataRows = rows.slice(1)
    const maxColumns = Math.max(...rows.map(row => row.length))

    // Analyze each column
    const columnAnalysis: GoogleSheetColumn[] = []
    const dataTypes: Record<string, string> = {}
    const columnStats: Record<string, any> = {}

    for (let colIndex = 0; colIndex < maxColumns; colIndex++) {
      const letter = String.fromCharCode(65 + (colIndex % 26)) + (colIndex >= 26 ? Math.floor(colIndex / 26) : '')
      const headerValue = headers[colIndex] || `Column ${letter}`
      const columnData = dataRows.map(row => row[colIndex]).filter(val => val !== undefined && val !== null && val !== '')
      
      // Data type analysis
      let dataType = 'text'
      let numericValues = 0
      let dateValues = 0
      const totalValues = columnData.length

      if (totalValues > 0) {
        columnData.forEach(value => {
          if (!isNaN(value) && !isNaN(parseFloat(value))) numericValues++
          if (!isNaN(Date.parse(value))) dateValues++
        })

        if (numericValues / totalValues > 0.7) {
          dataType = 'number'
        } else if (dateValues / totalValues > 0.7) {
          dataType = 'date'
        } else if (columnData.some(val => typeof val === 'boolean' || val === 'true' || val === 'false')) {
          dataType = 'boolean'
        }
      }

      // Column statistics
      const stats: any = {
        totalValues: totalValues,
        emptyValues: dataRows.length - totalValues,
        uniqueValues: new Set(columnData).size,
        sampleValues: columnData.slice(0, 5)
      }

      if (dataType === 'number') {
        const numbers = columnData.map(val => parseFloat(val)).filter(num => !isNaN(num))
        if (numbers.length > 0) {
          stats.min = Math.min(...numbers)
          stats.max = Math.max(...numbers)
          stats.average = numbers.reduce((a, b) => a + b, 0) / numbers.length
        }
      }

      columnAnalysis.push({
        id: letter,
        name: headerValue,
        value: letter,
        letter: letter,
        index: colIndex,
        dataType: dataType,
        hasData: totalValues > 0,
        sampleValues: columnData.slice(0, 3)
      })

      dataTypes[letter] = dataType
      columnStats[letter] = stats
    }

    const enhancedPreview: GoogleSheetEnhancedPreview = {
      headers: columnAnalysis,
      sampleData: dataRows.slice(0, Math.min(previewRows, 10)),
      totalRows: dataRows.length,
      totalColumns: maxColumns,
      hasHeaders: headers.length > 0 && headers.some(h => h && h.trim() !== ''),
      dataTypes: dataTypes,
      columnStats: columnStats
    }

    console.log(`✅ [Google Sheets] Enhanced preview completed for ${maxColumns} columns, ${dataRows.length} rows`)
    return [enhancedPreview]

  } catch (error: any) {
    console.error("❌ [Google Sheets] Error fetching enhanced preview:", error)
    throw error
  }
}