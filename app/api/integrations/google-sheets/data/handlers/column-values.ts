/**
 * Google Sheets Column Values Handler
 * Fetches unique values from a specific column for dynamic dropdown population
 */

import { GoogleSheetsIntegration, GoogleSheetsDataHandler, GoogleSheetsHandlerOptions } from '../types'
import { createGoogleSheetsClient } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getGoogleSheetsColumnValues: GoogleSheetsDataHandler<string[]> = async (
  integration: GoogleSheetsIntegration,
  options: GoogleSheetsHandlerOptions = {}
): Promise<string[]> => {
  const { spreadsheetId, sheetName, filterColumn } = options

  if (!spreadsheetId || !sheetName) {
    throw new Error('Spreadsheet ID and sheet name are required')
  }

  if (!filterColumn) {
    throw new Error('Column name is required to fetch values')
  }

  try {
    const sheets = await createGoogleSheetsClient(integration)

    // First, get headers to find the column index
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!1:1`,
      valueRenderOption: 'FORMATTED_VALUE'
    })

    const headers = headerResponse.data.values?.[0] || []

    // Find column index - support both header name and column letter
    let columnIndex: number = -1

    // Check if it's a column letter (A, B, C, etc.)
    if (/^[A-Z]+$/i.test(filterColumn)) {
      columnIndex = filterColumn.toUpperCase().charCodeAt(0) - 65
    } else {
      // Find by header name
      columnIndex = headers.findIndex((h: string) => h === filterColumn)

      // Try case-insensitive match if not found
      if (columnIndex === -1) {
        columnIndex = headers.findIndex((h: string) =>
          h.toLowerCase() === filterColumn.toLowerCase()
        )
      }
    }

    if (columnIndex === -1) {
      logger.warn(`Column "${filterColumn}" not found in headers:`, headers)
      return []
    }

    // Convert index to column letter
    const columnLetter = String.fromCharCode(65 + columnIndex)

    // Fetch all values from that column (skip header row)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!${columnLetter}2:${columnLetter}`,
      valueRenderOption: 'FORMATTED_VALUE'
    })

    const values = response.data.values || []

    // Extract unique, non-empty values
    const uniqueValues = new Set<string>()

    for (const row of values) {
      const value = row[0]
      if (value !== undefined && value !== null && value !== '') {
        uniqueValues.add(String(value).trim())
      }
    }

    // Convert to sorted array
    const sortedValues = Array.from(uniqueValues).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    )

    logger.debug(`Fetched ${sortedValues.length} unique values from column "${filterColumn}"`)

    return sortedValues

  } catch (error: any) {
    logger.error("Error fetching column values:", error)
    throw new Error(error.message || "Error fetching column values")
  }
}
