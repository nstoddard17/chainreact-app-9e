/**
 * Add Multiple Rows to Excel Action
 * Adds multiple rows to a worksheet in batch using Microsoft Graph API
 * Optimized for performance with batch requests
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/security/encryption'
import { logger } from '@/lib/utils/logger'
import { resolveValue } from '@/lib/workflows/actions/core'

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0'

interface AddMultipleRowsConfig {
  workbookId: string
  worksheetName: string
  inputMode?: 'simple' | 'json'
  rows?: any[] | string // Array of row data objects or JSON string
  // Simple mode row fields
  row1?: string | Record<string, any>
  row2?: string | Record<string, any>
  row3?: string | Record<string, any>
  row4?: string | Record<string, any>
  row5?: string | Record<string, any>
  row6?: string | Record<string, any>
  row7?: string | Record<string, any>
  row8?: string | Record<string, any>
  row9?: string | Record<string, any>
  row10?: string | Record<string, any>
  columnMapping?: Record<string, any> // Optional column mapping for each row
}

interface AddMultipleRowsOutput {
  rowsAdded: number
  firstRowNumber: number
  lastRowNumber: number
  worksheetName: string
  workbookId: string
  timestamp: string
}

/**
 * Add multiple rows to a worksheet in batch
 */
export async function addMicrosoftExcelMultipleRows(
  config: AddMultipleRowsConfig,
  userId: string,
  input: Record<string, any>
): Promise<{ success: boolean; output: AddMultipleRowsOutput; message: string }> {
  let { workbookId, worksheetName, inputMode, rows, columnMapping } = config

  // Helper to parse row data (handles both JSON string and object)
  const parseRowData = (rowData: string | Record<string, any> | undefined): Record<string, any> | null => {
    if (!rowData) return null
    if (typeof rowData === 'string') {
      const trimmed = rowData.trim()
      if (!trimmed) return null
      try {
        return JSON.parse(trimmed)
      } catch (e) {
        logger.warn('[Microsoft Excel] Failed to parse row JSON:', trimmed)
        return null
      }
    }
    return rowData
  }

  // Handle different input modes
  let parsedRows: any[] = []

  if (inputMode === 'simple' || !inputMode) {
    // Simple mode: Check for 'rows' field first (from MicrosoftExcelMultipleRowsFields component)
    // The UI component outputs JSON to the 'rows' field even in simple mode
    if (rows) {
      if (typeof rows === 'string') {
        try {
          parsedRows = JSON.parse(rows.trim())
        } catch (e) {
          logger.warn('[Microsoft Excel] Failed to parse rows JSON in simple mode:', rows)
        }
      } else if (Array.isArray(rows)) {
        parsedRows = rows
      }
    }

    // Fallback to row1, row2, ... row10 fields if no rows data
    if (parsedRows.length === 0) {
      const rowFields = [
        config.row1, config.row2, config.row3, config.row4, config.row5,
        config.row6, config.row7, config.row8, config.row9, config.row10
      ]

      for (const rowField of rowFields) {
        const parsed = parseRowData(rowField)
        if (parsed && Object.keys(parsed).length > 0) {
          parsedRows.push(parsed)
        }
      }
    }

    logger.debug('[Microsoft Excel] Simple mode - collected rows:', {
      rowCount: parsedRows.length
    })
  } else if (inputMode === 'json') {
    // JSON mode: Parse the rows field
    if (typeof rows === 'string') {
      try {
        parsedRows = JSON.parse(rows.trim())
      } catch (e) {
        throw new Error('Invalid JSON format for rows data')
      }
    } else if (Array.isArray(rows)) {
      parsedRows = rows
    }
  } else {
    // Legacy mode: Use rows directly if it's an array
    if (Array.isArray(rows)) {
      parsedRows = rows
    }
  }

  // Transform columnMapping from array format to object format if needed
  // The UI component (MicrosoftExcelColumnMapper) outputs: [{ column: "Name", value: "John" }]
  // But we need: { "Name": "John" }
  if (Array.isArray(columnMapping)) {
    logger.debug('[Microsoft Excel] Converting array format to object format');
    const mappingObject: Record<string, any> = {};
    for (const item of columnMapping) {
      if (item && item.column && item.value !== undefined) {
        mappingObject[item.column] = item.value;
      }
    }
    columnMapping = mappingObject;
  }

  logger.debug('[Microsoft Excel] Adding multiple rows:', {
    workbookId,
    worksheetName,
    inputMode,
    rowCount: parsedRows.length
  })

  // Validate rows array
  if (!parsedRows || parsedRows.length === 0) {
    throw new Error('At least one row is required. Please enter row data in JSON format.')
  }

  // Use parsedRows instead of rows for the rest of the function
  rows = parsedRows

  // Get Microsoft Excel integration
  const supabase = createAdminClient()
  const { data: integration, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'microsoft-excel')
    .eq('status', 'connected')
    .single()

  if (error || !integration) {
    throw new Error('Microsoft Excel integration not found or not connected')
  }

  // Decrypt access token
  const accessToken = await decrypt(integration.access_token)

  // URL encode the worksheet name for API calls
  const encodedWorksheetName = encodeURIComponent(worksheetName)

  try {
    // Step 1: Get the worksheet headers to determine column order
    const headersUrl = `${GRAPH_API_BASE}/me/drive/items/${workbookId}/workbook/worksheets('${encodedWorksheetName}')/range(address='1:1')`

    const headersResponse = await fetch(headersUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!headersResponse.ok) {
      throw new Error(`Failed to fetch headers: ${await headersResponse.text()}`)
    }

    const headersData = await headersResponse.json()
    const headers = headersData.values?.[0] || []

    // Filter out empty headers and get actual column count
    const nonEmptyHeaders = headers.filter((h: any) => h && h.toString().trim())

    logger.debug('[Microsoft Excel] Headers fetched:', {
      rawHeaders: headers,
      nonEmptyHeaders,
      headerCount: nonEmptyHeaders.length
    })

    // If no headers found, we can't proceed
    if (nonEmptyHeaders.length === 0) {
      throw new Error('No column headers found in row 1 of the worksheet. Please add headers first.')
    }

    // Step 2: Get current used range to determine where to append
    const usedRangeUrl = `${GRAPH_API_BASE}/me/drive/items/${workbookId}/workbook/worksheets('${encodedWorksheetName}')/usedRange`

    const usedRangeResponse = await fetch(usedRangeUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!usedRangeResponse.ok) {
      throw new Error(`Failed to fetch worksheet data: ${await usedRangeResponse.text()}`)
    }

    const usedRangeData = await usedRangeResponse.json()
    const currentRowCount = usedRangeData.rowCount || 1
    const firstNewRowNumber = currentRowCount + 1

    logger.debug('[Microsoft Excel] Used range data:', {
      rowCount: currentRowCount,
      firstNewRowNumber,
      usedRangeAddress: usedRangeData.address
    })

    // Step 3: Prepare row values arrays - use non-empty headers for column count
    // Map row data to match header order
    const rowValues: any[][] = rows.map((rowData) => {
      return nonEmptyHeaders.map((header: string) => {
        // Check if columnMapping is provided
        if (columnMapping && columnMapping[header] !== undefined) {
          return resolveValue(columnMapping[header], { ...input, ...rowData })
        }
        // Otherwise use the row data directly
        return rowData[header] !== undefined ? resolveValue(rowData[header], input) : ''
      })
    })

    logger.debug('[Microsoft Excel] Row values prepared:', {
      rowCount: rowValues.length,
      firstRowValues: rowValues[0],
      columnCount: nonEmptyHeaders.length
    })

    // Step 4: Calculate the range for the new rows
    // Helper to convert column number to Excel column letters (1=A, 26=Z, 27=AA, etc.)
    const getColumnLetter = (colNum: number): string => {
      let letter = ''
      while (colNum > 0) {
        const remainder = (colNum - 1) % 26
        letter = String.fromCharCode(65 + remainder) + letter
        colNum = Math.floor((colNum - 1) / 26)
      }
      return letter
    }

    // Use nonEmptyHeaders.length for column count to match rowValues dimensions
    const lastColumn = getColumnLetter(nonEmptyHeaders.length)
    const rangeAddress = `A${firstNewRowNumber}:${lastColumn}${firstNewRowNumber + rows.length - 1}`

    logger.debug('[Microsoft Excel] Range calculation:', {
      lastColumn,
      rangeAddress,
      rowValuesLength: rowValues.length,
      firstRowLength: rowValues[0]?.length
    })

    // Step 5: Add all rows in a single batch operation
    const addRowsUrl = `${GRAPH_API_BASE}/me/drive/items/${workbookId}/workbook/worksheets('${encodedWorksheetName}')/range(address='${rangeAddress}')`

    const addRowsResponse = await fetch(addRowsUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: rowValues
      })
    })

    if (!addRowsResponse.ok) {
      const errorText = await addRowsResponse.text()
      logger.error('[Microsoft Excel] Failed to add rows:', {
        status: addRowsResponse.status,
        error: errorText,
        rangeAddress,
        rowValuesCount: rowValues.length
      })
      throw new Error(`Failed to add rows: ${errorText}`)
    }

    logger.debug('[Microsoft Excel] Successfully added multiple rows')

    return {
      success: true,
      output: {
        rowsAdded: rows.length,
        firstRowNumber: firstNewRowNumber,
        lastRowNumber: firstNewRowNumber + rows.length - 1,
        worksheetName,
        workbookId,
        timestamp: new Date().toISOString()
      },
      message: `Successfully added ${rows.length} rows to ${worksheetName}`
    }

  } catch (error: any) {
    logger.error('[Microsoft Excel] Error adding multiple rows:', error)
    throw new Error(`Failed to add multiple rows: ${error.message}`)
  }
}
