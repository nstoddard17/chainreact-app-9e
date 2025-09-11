import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

/**
 * Deletes rows from a Google Sheets spreadsheet
 */
export async function deleteGoogleSheetsRow(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "google-sheets")

    const spreadsheetId = resolveValue(config.spreadsheetId, input)
    const sheetName = resolveValue(config.sheetName, input)
    const deleteBy = resolveValue(config.deleteBy, input)
    const rowNumber = resolveValue(config.rowNumber, input)
    const startRow = resolveValue(config.startRow, input)
    const endRow = resolveValue(config.endRow, input)
    const matchColumn = resolveValue(config.matchColumn, input)
    const matchValue = resolveValue(config.matchValue, input)
    const deleteAll = resolveValue(config.deleteAll, input) || false
    const confirmDelete = resolveValue(config.confirmDelete, input)

    console.log("Resolved delete row values:", {
      spreadsheetId,
      sheetName,
      deleteBy,
      rowNumber,
      startRow,
      endRow,
      matchColumn,
      matchValue,
      deleteAll,
      confirmDelete
    })

    if (!spreadsheetId || !sheetName) {
      const message = `Missing required fields: ${!spreadsheetId ? "Spreadsheet ID" : ""} ${!sheetName ? "Sheet Name" : ""}`
      console.error(message)
      return { success: false, message }
    }

    if (!confirmDelete) {
      return {
        success: false,
        message: "Delete operation not confirmed. Please check the 'Confirm Delete' option to proceed."
      }
    }

    // First, get sheet metadata to find sheet ID
    const metadataResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!metadataResponse.ok) {
      throw new Error(`Failed to fetch sheet metadata: ${metadataResponse.status}`)
    }

    const metadata = await metadataResponse.json()
    const sheet = metadata.sheets?.find((s: any) => s.properties.title === sheetName)
    
    if (!sheet) {
      return {
        success: false,
        message: `Sheet "${sheetName}" not found in spreadsheet`
      }
    }

    const sheetId = sheet.properties.sheetId

    // Get all sheet data to find rows to delete
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
        message: "No data rows found in the sheet to delete"
      }
    }

    // Find the row(s) to delete
    const rowsToDelete: number[] = []
    const deletedData: any[] = []

    if (deleteBy === 'row_number' && rowNumber) {
      const rowNum = parseInt(rowNumber.toString())
      if (rowNum > 1 && rowNum <= rows.length) {
        rowsToDelete.push(rowNum)
        deletedData.push(rows[rowNum - 1])
      }
    } else if (deleteBy === 'range' && startRow && endRow) {
      const start = parseInt(startRow.toString())
      const end = parseInt(endRow.toString())
      for (let i = start; i <= end && i <= rows.length; i++) {
        if (i > 1) {
          rowsToDelete.push(i)
          deletedData.push(rows[i - 1])
        }
      }
    } else if (deleteBy === 'column_value' && matchColumn && matchValue) {
      // Find column index
      let columnIndex = -1
      // Check if matchColumn is a SINGLE column letter (A-Z only, not AA, AB, etc.)
      // and NOT a word like "Address" or "RSVP"
      if (/^[A-Z]$/i.test(matchColumn)) {
        columnIndex = matchColumn.toUpperCase().charCodeAt(0) - 65
      } else {
        columnIndex = headers.findIndex((h: string) => h === matchColumn)
      }

      if (columnIndex >= 0) {
        for (let i = 1; i < rows.length; i++) {
          if (rows[i][columnIndex] === matchValue) {
            rowsToDelete.push(i + 1)
            deletedData.push(rows[i])
            if (!deleteAll) break
          }
        }
      }
    }

    if (rowsToDelete.length === 0) {
      return {
        success: false,
        message: "No rows found matching the specified criteria to delete"
      }
    }

    // Sort rows in descending order to delete from bottom to top
    // This prevents index shifting issues
    rowsToDelete.sort((a, b) => b - a)

    // Create batch delete requests
    const requests = rowsToDelete.map(rowNum => ({
      deleteDimension: {
        range: {
          sheetId: sheetId,
          dimension: "ROWS",
          startIndex: rowNum - 1, // 0-based index
          endIndex: rowNum // exclusive end
        }
      }
    }))

    // Execute batch delete
    const deleteResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: requests
        }),
      }
    )

    if (!deleteResponse.ok) {
      const errorData = await deleteResponse.json().catch(() => ({}))
      throw new Error(`Failed to delete rows: ${deleteResponse.status} - ${errorData.error?.message || deleteResponse.statusText}`)
    }

    // Convert deleted data to key-value format
    const formattedDeletedData = deletedData.map(row => {
      const rowData: Record<string, any> = {}
      headers.forEach((header: string, index: number) => {
        if (header && row[index] !== undefined) {
          rowData[header] = row[index]
        }
      })
      return rowData
    })

    return {
      success: true,
      output: {
        rowsDeleted: rowsToDelete.length,
        deletedData: formattedDeletedData,
        timestamp: new Date().toISOString(),
        spreadsheetId: spreadsheetId,
        sheetName: sheetName
      },
      message: `Successfully deleted ${rowsToDelete.length} row(s) from ${sheetName}`
    }

  } catch (error: any) {
    console.error("Google Sheets delete row error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while deleting rows"
    }
  }
}