import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

import { logger } from '@/lib/utils/logger'

/**
 * Creates a new row in a Microsoft Excel worksheet using the Microsoft Graph API
 * Supports:
 * - Worksheets with headers (uses header names as column identifiers)
 * - Worksheets without headers (uses column letters A, B, C as identifiers)
 * - Blank worksheets (starts from row 1)
 * - Three insert positions: append, prepend, specific_row
 */
export async function createMicrosoftExcelRow(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration with workflow variables
    const resolvedConfig = resolveValue(config, input)
    let { workbookId, worksheetName, insertPosition = 'append', specificRow, hasHeaders = 'yes', columnMapping } = resolvedConfig

    // Normalize hasHeaders to boolean
    const useHeaders = hasHeaders === 'yes' || hasHeaders === true

    logger.debug('📊 [Excel Create Row] Config:', {
      workbookId,
      worksheetName,
      insertPosition,
      specificRow,
      hasHeaders,
      useHeaders,
      columnMapping
    })

    // Transform columnMapping from array format to object format if needed
    // The UI component (MicrosoftExcelColumnMapper) outputs: [{ column: "Name", value: "John" }]
    // But we need: { "Name": "John" } or { "A": "John" } for letter columns
    if (Array.isArray(columnMapping)) {
      logger.debug('📊 [Excel Create Row] Converting array format to object format');
      const mappingObject: Record<string, any> = {};
      for (const item of columnMapping) {
        if (item && item.column && item.value !== undefined) {
          mappingObject[item.column] = item.value;
        }
      }
      columnMapping = mappingObject;
    }

    // Get access token for Microsoft Excel (Microsoft Graph API)
    const accessToken = await getDecryptedAccessToken(userId, 'microsoft-excel')
    if (!accessToken) {
      throw new Error('No Microsoft Excel access token found. Please connect your Microsoft Excel account.')
    }

    // Validate required fields
    if (!workbookId) {
      throw new Error('Workbook ID is required')
    }
    if (!worksheetName) {
      throw new Error('Worksheet name is required')
    }
    if (!columnMapping || Object.keys(columnMapping).length === 0) {
      throw new Error('Column mapping is required')
    }

    // Microsoft Graph API base URL
    const baseUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${workbookId}/workbook`

    // Build the values array based on column mapping
    // For header-based columns, we need to map header names to column positions
    // For letter-based columns (A, B, C), we directly use the position
    let values: any[] = []
    let columnPositions: number[] = []

    const columnKeys = Object.keys(columnMapping)
    logger.debug('📊 [Excel Create Row] Column keys:', columnKeys)

    if (!useHeaders) {
      // Column letters mode (A, B, C, etc.)
      // Convert letter columns to positions and build sparse array
      for (const [columnLetter, value] of Object.entries(columnMapping)) {
        // Convert A=0, B=1, C=2, etc.
        const position = columnLetter.charCodeAt(0) - 65
        columnPositions.push(position)
        logger.debug(`  Column "${columnLetter}" (position ${position}) -> value: "${value}"`)
      }

      // Find the max position to determine array size
      const maxPosition = Math.max(...columnPositions)
      values = new Array(maxPosition + 1).fill('')

      // Fill in the values at correct positions
      let i = 0
      for (const value of Object.values(columnMapping)) {
        values[columnPositions[i]] = value || ''
        i++
      }
    } else {
      // Header-based mode - need to map header names to column positions
      // First, fetch the headers from row 1
      const headersResponse = await fetch(
        `${baseUrl}/worksheets('${worksheetName}')/usedRange`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      )

      let headerRow: string[] = []
      if (headersResponse.ok) {
        const usedRangeData = await headersResponse.json()
        if (usedRangeData.values && usedRangeData.values.length > 0) {
          headerRow = usedRangeData.values[0].map((h: any) => h?.toString().trim() || '')
        }
      }

      logger.debug('📊 [Excel Create Row] Header row:', headerRow)

      if (headerRow.length === 0) {
        // No headers found, but user said there are headers
        // This could be a blank sheet - use the column names as new headers
        // Just put values in order starting from A
        for (const value of Object.values(columnMapping)) {
          values.push(value || '')
        }
      } else {
        // Map each column name to its position in the header row
        const maxPosition = headerRow.length - 1
        values = new Array(maxPosition + 1).fill('')

        for (const [columnName, value] of Object.entries(columnMapping)) {
          const position = headerRow.findIndex(h => h === columnName)
          if (position !== -1) {
            values[position] = value || ''
            logger.debug(`  Header "${columnName}" (position ${position}) -> value: "${value}"`)
          } else {
            // Header not found - might be a column letter format
            if (/^[A-Z]$/.test(columnName)) {
              const letterPosition = columnName.charCodeAt(0) - 65
              if (letterPosition <= maxPosition) {
                values[letterPosition] = value || ''
                logger.debug(`  Column letter "${columnName}" (position ${letterPosition}) -> value: "${value}"`)
              }
            } else {
              logger.debug(`  Column "${columnName}" not found in headers, skipping`)
            }
          }
        }
      }
    }

    logger.debug('📊 [Excel Create Row] Final values array:', values)

    // Calculate the column range
    const columnCount = values.length
    const endColumn = String.fromCharCode(65 + columnCount - 1) // A=65, so A+0=A, A+1=B, etc.

    // Determine the target row based on insert position
    let targetRow = 1

    // Get the used range to understand the worksheet state
    const usedRangeResponse = await fetch(
      `${baseUrl}/worksheets('${worksheetName}')/usedRange?$select=address,rowCount`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    let lastDataRow = 0
    let isBlankSheet = true

    if (usedRangeResponse.ok) {
      const usedRange = await usedRangeResponse.json()
      // Parse the range to find the last row (e.g., "Sheet1!A1:C10" -> row 10)
      const match = usedRange.address?.match(/:([A-Z]+)(\d+)/)
      if (match) {
        lastDataRow = parseInt(match[2])
        isBlankSheet = false
      }
      logger.debug('📊 [Excel Create Row] Used range:', usedRange.address, 'Last row:', lastDataRow)
    } else {
      logger.debug('📊 [Excel Create Row] No used range - blank worksheet')
    }

    // Determine where to insert based on position and headers
    if (insertPosition === 'append') {
      if (isBlankSheet) {
        // Blank sheet - start at row 1
        targetRow = 1
      } else {
        // Append after the last row of data
        targetRow = lastDataRow + 1
      }
    } else if (insertPosition === 'prepend') {
      if (isBlankSheet) {
        // Blank sheet - start at row 1
        targetRow = 1
      } else if (useHeaders) {
        // Has headers - insert at row 2 (after headers)
        targetRow = 2
      } else {
        // No headers - insert at row 1
        targetRow = 1
      }
    } else if (insertPosition === 'specific_row' && specificRow) {
      targetRow = parseInt(specificRow)
    }

    logger.debug('📊 [Excel Create Row] Target row:', targetRow, 'Insert position:', insertPosition)

    const rangeAddress = `${worksheetName}!A${targetRow}:${endColumn}${targetRow}`

    // For prepend or specific_row, we need to shift existing rows down
    if ((insertPosition === 'prepend' || insertPosition === 'specific_row') && !isBlankSheet) {
      // Insert a blank row at the position (shifts existing content down)
      const insertUrl = `${baseUrl}/worksheets('${worksheetName}')/range(address='${rangeAddress}')/insert`
      const insertResponse = await fetch(insertUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          shift: 'Down'
        })
      })

      if (!insertResponse.ok) {
        const error = await insertResponse.text()
        throw new Error(`Failed to insert row: ${error}`)
      }
      logger.debug('📊 [Excel Create Row] Inserted blank row at:', rangeAddress)
    }

    // Now update the range with the values
    const updateUrl = `${baseUrl}/worksheets('${worksheetName}')/range(address='${rangeAddress}')`
    const updateResponse = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [values]
      })
    })

    if (!updateResponse.ok) {
      const error = await updateResponse.text()
      throw new Error(`Failed to add row: ${error}`)
    }

    const result = await updateResponse.json()

    return {
      success: true,
      output: {
        workbookId,
        worksheetName,
        range: result.address || rangeAddress,
        rowNumber: targetRow,
        values: [values],
        timestamp: new Date().toISOString()
      },
      message: `Successfully added row ${targetRow} to ${worksheetName}`
    }

  } catch (error: any) {
    logger.error('❌ [Microsoft Excel Create Row] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create row in Excel'
    }
  }
}