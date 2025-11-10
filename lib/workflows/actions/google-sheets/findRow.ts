import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

import { logger } from '@/lib/utils/logger'

/**
 * Find a row in a Google Sheets spreadsheet by column value or search criteria
 */
export async function findGoogleSheetsRow(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "google-sheets")

    const spreadsheetId = resolveValue(config.spreadsheetId, input)
    const sheetName = resolveValue(config.sheetName, input)
    const searchColumn = resolveValue(config.searchColumn, input)
    const searchValue = resolveValue(config.searchValue, input)
    const matchType = resolveValue(config.matchType, input) || 'exact'

    logger.debug("🔍 Find Google Sheets Row - Resolved values:", {
      spreadsheetId,
      sheetName,
      searchColumn,
      searchValue,
      matchType
    })

    if (!spreadsheetId || !sheetName || !searchColumn || !searchValue) {
      const missing = []
      if (!spreadsheetId) missing.push("Spreadsheet ID")
      if (!sheetName) missing.push("Sheet Name")
      if (!searchColumn) missing.push("Search Column")
      if (!searchValue) missing.push("Search Value")
      const message = `Missing required fields: ${missing.join(", ")}`
      logger.error(message)
      return { success: false, message }
    }

    // Fetch sheet data
    const dataResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!dataResponse.ok) {
      throw new Error(`Failed to fetch sheet data: ${dataResponse.status}`)
    }

    const sheetData = await dataResponse.json()
    const allRows = sheetData.values || []

    if (allRows.length === 0) {
      return {
        success: true,
        output: {
          found: false,
          rowNumber: null,
          rowData: null,
          message: "Sheet is empty"
        },
        message: "Sheet is empty - no rows to search"
      }
    }

    // Extract headers (first row)
    const headers = allRows[0] || []
    const dataRows = allRows.slice(1)

    if (dataRows.length === 0) {
      return {
        success: true,
        output: {
          found: false,
          rowNumber: null,
          rowData: null,
          message: "No data rows to search (only headers present)"
        },
        message: "No data rows to search"
      }
    }

    logger.debug(`🔍 Searching ${dataRows.length} rows with headers:`, headers)

    // Determine if searching all columns or specific column
    const searchAllColumns = searchColumn === '*'
    const searchValueLower = String(searchValue).toLowerCase().trim()

    // Find matching row
    let foundRowIndex = -1
    let matchedColumn: string | null = null

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      let rowMatches = false

      if (searchAllColumns) {
        // Search across all columns
        for (let colIndex = 0; colIndex < row.length; colIndex++) {
          const cellValue = row[colIndex]
          if (cellValue === null || cellValue === undefined || cellValue === '') continue

          const cellValueStr = String(cellValue).toLowerCase().trim()

          if (matchesSearchCriteria(cellValueStr, searchValueLower, matchType)) {
            rowMatches = true
            matchedColumn = headers[colIndex] || `Column ${colIndex + 1}`
            break
          }
        }
      } else {
        // Search specific column
        const columnIndex = headers.indexOf(searchColumn)
        if (columnIndex === -1) {
          return {
            success: false,
            message: `Column "${searchColumn}" not found in sheet headers: ${headers.join(", ")}`
          }
        }

        const cellValue = row[columnIndex]
        if (cellValue !== null && cellValue !== undefined && cellValue !== '') {
          const cellValueStr = String(cellValue).toLowerCase().trim()

          if (matchesSearchCriteria(cellValueStr, searchValueLower, matchType)) {
            rowMatches = true
            matchedColumn = searchColumn
          }
        }
      }

      if (rowMatches) {
        foundRowIndex = i
        break
      }
    }

    // If no match found
    if (foundRowIndex === -1) {
      return {
        success: true,
        output: {
          found: false,
          rowNumber: null,
          rowData: null,
          searchCriteria: {
            column: searchAllColumns ? 'All Columns' : searchColumn,
            value: searchValue,
            matchType
          },
          message: `No matching row found for "${searchValue}"`
        },
        message: `No matching row found`
      }
    }

    // Build row data object
    const foundRow = dataRows[foundRowIndex]
    const rowData: Record<string, any> = {}
    headers.forEach((header, index) => {
      rowData[header] = foundRow[index] !== undefined ? foundRow[index] : null
    })

    // Row number is index + 2 (1-indexed, +1 for header row)
    const rowNumber = foundRowIndex + 2

    logger.debug(`✅ Found matching row at row ${rowNumber}:`, rowData)

    return {
      success: true,
      output: {
        found: true,
        rowNumber,
        rowData,
        matchedColumn,
        searchCriteria: {
          column: searchAllColumns ? 'All Columns' : searchColumn,
          value: searchValue,
          matchType
        },
        message: `Found matching row at row ${rowNumber}${matchedColumn ? ` (matched in column: ${matchedColumn})` : ''}`
      },
      message: `Successfully found row at row ${rowNumber}`
    }

  } catch (error: any) {
    logger.error("Error finding Google Sheets row:", error)
    return {
      success: false,
      message: `Failed to find row: ${error.message}`
    }
  }
}

/**
 * Normalize boolean values for comparison
 * Converts various boolean representations to a standard format
 */
function normalizeBooleanValue(value: string): string {
  const normalized = value.toLowerCase().trim()

  // Check for truthy values
  if (['yes', 'y', 'true', 't', '1', 'on', 'enabled'].includes(normalized)) {
    return 'true'
  }

  // Check for falsy values
  if (['no', 'n', 'false', 'f', '0', 'off', 'disabled'].includes(normalized)) {
    return 'false'
  }

  // Return original if not a boolean-like value
  return value
}

/**
 * Helper function to check if a value matches search criteria
 */
function matchesSearchCriteria(cellValue: string, searchValue: string, matchType: string): boolean {
  // Try boolean normalization for exact matches
  if (matchType === 'exact') {
    const normalizedCell = normalizeBooleanValue(cellValue)
    const normalizedSearch = normalizeBooleanValue(searchValue)

    // If both normalized to true/false, compare normalized values
    if ((normalizedCell === 'true' || normalizedCell === 'false') &&
        (normalizedSearch === 'true' || normalizedSearch === 'false')) {
      return normalizedCell === normalizedSearch
    }
  }

  // Standard string matching
  switch (matchType) {
    case 'exact':
      return cellValue === searchValue
    case 'contains':
      return cellValue.includes(searchValue)
    case 'starts_with':
      return cellValue.startsWith(searchValue)
    default:
      return cellValue === searchValue
  }
}
