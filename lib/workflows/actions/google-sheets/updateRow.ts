import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

import { logger } from '@/lib/utils/logger'

/**
 * Updates an existing row in a Google Sheets spreadsheet
 */
export async function updateGoogleSheetsRow(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "google-sheets")

    const spreadsheetId = resolveValue(config.spreadsheetId, input)
    const sheetName = resolveValue(config.sheetName, input)
    const findRowBy = resolveValue(config.findRowBy, input)
    const rowSelection = resolveValue(config.rowSelection, input)
    let rowNumber = resolveValue(config.rowNumber, input)
    const matchColumn = resolveValue(config.matchColumn, input)
    const matchValue = resolveValue(config.matchValue, input)
    const conditions = config.conditions || []
    const updateMapping = config.updateMapping || {}
    const updateMultiple = resolveValue(config.updateMultiple, input) || false

    // Support both array-based values (automation) and column-based updateMapping (UI)
    let valuesArray = null
    if (config.values) {
      const resolvedValues = resolveValue(config.values, input)
      // Handle both JSON string and actual array
      if (typeof resolvedValues === 'string') {
        try {
          valuesArray = JSON.parse(resolvedValues)
        } catch (e) {
          logger.warn('Failed to parse values as JSON, treating as single value:', resolvedValues)
          valuesArray = [resolvedValues]
        }
      } else if (Array.isArray(resolvedValues)) {
        valuesArray = resolvedValues
      }
    }

    logger.debug("Resolved update row values:", {
      spreadsheetId,
      sheetName,
      findRowBy,
      rowSelection,
      rowNumber,
      matchColumn,
      matchValue,
      conditions,
      updateMapping,
      updateMappingKeys: Object.keys(updateMapping),
      updateMappingValues: Object.values(updateMapping),
      updateMultiple,
      valuesArray,
      hasValuesArray: !!valuesArray
    })

    if (!spreadsheetId || !sheetName) {
      const message = `Missing required fields: ${!spreadsheetId ? "Spreadsheet ID" : ""} ${!sheetName ? "Sheet Name" : ""}`
      logger.error(message)
      return { success: false, message }
    }

    // Get all sheet data to find rows to update
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
    const rows = sheetData.values || []
    const headers = rows[0] || []

    if (rows.length < 2) {
      return {
        success: false,
        message: "No data rows found in the sheet"
      }
    }

    // Handle row selection shortcuts
    if (rowSelection === 'last') {
      rowNumber = rows.length // Last row
      logger.debug(`Using last row: ${rowNumber}`)
    } else if (rowSelection === 'first_data') {
      rowNumber = 2 // First data row below headers
      logger.debug(`Using first data row: ${rowNumber}`)
    }

    // Find the row(s) to update
    const rowsToUpdate: number[] = []

    // Auto-detect findRowBy if not explicitly set but rowNumber is provided
    const effectiveFindRowBy = findRowBy || (rowNumber ? 'row_number' : null)

    if (effectiveFindRowBy === 'row_number' && rowNumber) {
      rowsToUpdate.push(parseInt(rowNumber.toString()))
    } else if (effectiveFindRowBy === 'column_value' && matchColumn && matchValue) {
      // Find column index
      let columnIndex = -1
      if (/^[A-Z]+$/i.test(matchColumn)) {
        columnIndex = matchColumn.toUpperCase().charCodeAt(0) - 65
      } else {
        columnIndex = headers.findIndex((h: string) => h === matchColumn)
      }

      if (columnIndex >= 0) {
        for (let i = 1; i < rows.length; i++) {
          if (rows[i][columnIndex] === matchValue) {
            rowsToUpdate.push(i + 1) // Convert to 1-based row number
            if (!updateMultiple) break
          }
        }
      }
    } else if (effectiveFindRowBy === 'multiple_conditions' && conditions.length > 0) {
      for (let i = 1; i < rows.length; i++) {
        let allConditionsMet = true
        
        for (const condition of conditions) {
          const { column, operator, value } = condition
          let columnIndex = -1
          
          if (/^[A-Z]+$/i.test(column)) {
            columnIndex = column.toUpperCase().charCodeAt(0) - 65
          } else {
            columnIndex = headers.findIndex((h: string) => h === column)
          }

          if (columnIndex >= 0) {
            const cellValue = rows[i][columnIndex] || ''
            const compareValue = resolveValue(value, input)

            let conditionMet = false
            switch (operator) {
              case 'equals':
                conditionMet = cellValue === compareValue
                break
              case 'not_equals':
                conditionMet = cellValue !== compareValue
                break
              case 'contains':
                conditionMet = cellValue.toString().includes(compareValue)
                break
              case 'starts_with':
                conditionMet = cellValue.toString().startsWith(compareValue)
                break
              case 'ends_with':
                conditionMet = cellValue.toString().endsWith(compareValue)
                break
              case 'greater_than':
                conditionMet = parseFloat(cellValue) > parseFloat(compareValue)
                break
              case 'less_than':
                conditionMet = parseFloat(cellValue) < parseFloat(compareValue)
                break
              case 'is_empty':
                conditionMet = !cellValue || cellValue === ''
                break
              case 'is_not_empty':
                conditionMet = cellValue && cellValue !== ''
                break
            }

            if (!conditionMet) {
              allConditionsMet = false
              break
            }
          }
        }

        if (allConditionsMet) {
          rowsToUpdate.push(i + 1)
          if (!updateMultiple) break
        }
      }
    }

    if (rowsToUpdate.length === 0) {
      return {
        success: false,
        message: "No rows found matching the specified criteria"
      }
    }

    // Prepare update data
    const updateRequests = []
    const previousValues: any[] = []
    const newValues: any[] = []

    for (const rowNum of rowsToUpdate) {
      const rowIndex = rowNum - 1
      const currentRow = rows[rowIndex] || []
      let updatedRow = [...currentRow]

      logger.debug(`Processing row ${rowNum} (index ${rowIndex}):`, {
        currentRow,
        headers,
        hasValuesArray: !!valuesArray
      })

      // Store previous values
      previousValues.push({...currentRow})

      // Mode 1: Array-based values (automation mode) - replaces entire row
      if (valuesArray && Array.isArray(valuesArray)) {
        logger.debug('Using values array for update:', valuesArray)
        updatedRow = [...valuesArray]
      }
      // Mode 2: Column-based updateMapping (UI mode) - updates specific columns
      else {
        // Apply updates
        for (const [columnIdentifier, value] of Object.entries(updateMapping)) {
          if (value !== undefined && value !== null) {
            const resolvedValue = resolveValue(value, input)

            let columnIndex = -1
            // Check if columnIdentifier is a SINGLE column letter (A-Z only, not AA, AB, etc.)
            // and NOT a word like "Address" or "RSVP"
            if (/^[A-Z]$/i.test(columnIdentifier)) {
              columnIndex = columnIdentifier.toUpperCase().charCodeAt(0) - 65
              logger.debug(`Column ${columnIdentifier} is letter notation, index: ${columnIndex}`)
            } else {
              columnIndex = headers.findIndex((h: string) => h === columnIdentifier)
              logger.debug(`Column ${columnIdentifier} is header name, found at index: ${columnIndex}`)
            }

            if (columnIndex >= 0) {
              // Ensure the row has enough columns
              while (updatedRow.length <= columnIndex) {
                updatedRow.push('')
              }
              logger.debug(`Setting column ${columnIdentifier} (index ${columnIndex}) to value: ${resolvedValue}`)
              updatedRow[columnIndex] = resolvedValue
            } else {
              logger.warn(`Could not find column index for: ${columnIdentifier}`)
            }
          }
        }
      }

      newValues.push(updatedRow)

      const range = `${sheetName}!A${rowNum}:${String.fromCharCode(65 + updatedRow.length - 1)}${rowNum}`
      logger.debug(`Update range: ${range}, Updated row:`, updatedRow)

      updateRequests.push({
        range,
        values: [updatedRow]
      })
    }

    const requestBody = {
      valueInputOption: "USER_ENTERED",
      data: updateRequests
    }
    
    logger.debug("Sending batch update request:", JSON.stringify(requestBody, null, 2))

    // Batch update all rows
    const updateResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    )

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json().catch(() => ({}))
      throw new Error(`Failed to update rows: ${updateResponse.status} - ${errorData.error?.message || updateResponse.statusText}`)
    }

    const result = await updateResponse.json()

    return {
      success: true,
      output: {
        rowsUpdated: rowsToUpdate.length,
        ranges: updateRequests.map(r => r.range),
        previousValues: previousValues,
        newValues: newValues,
        timestamp: new Date().toISOString(),
        spreadsheetId: spreadsheetId,
        sheetName: sheetName
      },
      message: `Successfully updated ${rowsToUpdate.length} row(s) in ${sheetName}`
    }

  } catch (error: any) {
    logger.error("Google Sheets update row error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while updating the row"
    }
  }
}