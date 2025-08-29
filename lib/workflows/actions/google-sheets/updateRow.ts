import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

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
    const rowNumber = resolveValue(config.rowNumber, input)
    const matchColumn = resolveValue(config.matchColumn, input)
    const matchValue = resolveValue(config.matchValue, input)
    const conditions = config.conditions || []
    const updateMapping = config.updateMapping || {}
    const updateMultiple = resolveValue(config.updateMultiple, input) || false

    console.log("Resolved update row values:", {
      spreadsheetId,
      sheetName,
      findRowBy,
      rowNumber,
      matchColumn,
      matchValue,
      conditions,
      updateMapping: Object.keys(updateMapping),
      updateMultiple
    })

    if (!spreadsheetId || !sheetName) {
      const message = `Missing required fields: ${!spreadsheetId ? "Spreadsheet ID" : ""} ${!sheetName ? "Sheet Name" : ""}`
      console.error(message)
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

    // Find the row(s) to update
    const rowsToUpdate: number[] = []

    if (findRowBy === 'row_number' && rowNumber) {
      rowsToUpdate.push(parseInt(rowNumber.toString()))
    } else if (findRowBy === 'column_value' && matchColumn && matchValue) {
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
    } else if (findRowBy === 'multiple_conditions' && conditions.length > 0) {
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
      const updatedRow = [...currentRow]
      
      // Store previous values
      previousValues.push({...currentRow})

      // Apply updates
      for (const [columnIdentifier, value] of Object.entries(updateMapping)) {
        if (value !== undefined && value !== null) {
          const resolvedValue = resolveValue(value, input)
          
          let columnIndex = -1
          if (/^[A-Z]+$/i.test(columnIdentifier)) {
            columnIndex = columnIdentifier.toUpperCase().charCodeAt(0) - 65
          } else {
            columnIndex = headers.findIndex((h: string) => h === columnIdentifier)
          }

          if (columnIndex >= 0) {
            // Ensure the row has enough columns
            while (updatedRow.length <= columnIndex) {
              updatedRow.push('')
            }
            updatedRow[columnIndex] = resolvedValue
          }
        }
      }

      newValues.push(updatedRow)

      updateRequests.push({
        range: `${sheetName}!A${rowNum}:${String.fromCharCode(65 + updatedRow.length - 1)}${rowNum}`,
        values: [updatedRow]
      })
    }

    // Batch update all rows
    const updateResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          valueInputOption: "USER_ENTERED",
          data: updateRequests
        }),
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
    console.error("Google Sheets update row error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while updating the row"
    }
  }
}