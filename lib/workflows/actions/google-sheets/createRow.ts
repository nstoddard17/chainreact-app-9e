import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

/**
 * Creates a new row in a Google Sheets spreadsheet
 */
export async function createGoogleSheetsRow(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "google-sheets")

    const spreadsheetId = resolveValue(config.spreadsheetId, input)
    const sheetName = resolveValue(config.sheetName, input)
    const insertPosition = resolveValue(config.insertPosition, input) || 'append'
    const specificRow = resolveValue(config.specificRow, input)
    const fieldMapping = config.fieldMapping || {}

    console.log("Resolved create row values:", {
      spreadsheetId,
      sheetName,
      insertPosition,
      specificRow,
      fieldMapping: Object.keys(fieldMapping)
    })

    if (!spreadsheetId || !sheetName) {
      const missingFields = []
      if (!spreadsheetId) missingFields.push("Spreadsheet ID")
      if (!sheetName) missingFields.push("Sheet Name")

      const message = `Missing required fields for creating row: ${missingFields.join(", ")}`
      console.error(message)
      return { success: false, message }
    }

    // First, get the headers to understand column structure
    const headerResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!headerResponse.ok) {
      throw new Error(`Failed to fetch headers: ${headerResponse.status}`)
    }

    const headerData = await headerResponse.json()
    const headers = headerData.values?.[0] || []

    // Map field values to column positions
    const rowValues: any[] = new Array(Math.max(headers.length, Object.keys(fieldMapping).length))
    
    for (const [columnIdentifier, value] of Object.entries(fieldMapping)) {
      if (value !== undefined && value !== null && value !== '') {
        const resolvedValue = resolveValue(value, input)
        
        // Check if columnIdentifier is a column letter (A, B, C, etc.)
        if (/^[A-Z]+$/i.test(columnIdentifier)) {
          const index = columnIdentifier.toUpperCase().charCodeAt(0) - 65
          rowValues[index] = resolvedValue
        } else {
          // Find by header name
          const headerIndex = headers.findIndex((h: string) => h === columnIdentifier)
          if (headerIndex >= 0) {
            rowValues[headerIndex] = resolvedValue
          }
        }
      }
    }

    // Replace undefined values with empty strings
    const finalRowValues = rowValues.map(v => v === undefined ? '' : v)

    // Determine the range based on insert position
    let range = sheetName
    let insertDataOption = 'INSERT_ROWS'
    
    if (insertPosition === 'append') {
      range = `${sheetName}!A:A` // Append to end
      insertDataOption = 'INSERT_ROWS'
    } else if (insertPosition === 'prepend') {
      range = `${sheetName}!A2:2` // Insert at row 2 (after headers)
      insertDataOption = 'INSERT_ROWS'
    } else if (insertPosition === 'specific_row' && specificRow) {
      range = `${sheetName}!A${specificRow}:${specificRow}`
      insertDataOption = 'INSERT_ROWS'
    }

    // Insert the row
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=${insertDataOption}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: [finalRowValues],
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to create row: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }

    const result = await response.json()

    // Create a key-value object of the inserted data
    const insertedData: Record<string, any> = {}
    headers.forEach((header: string, index: number) => {
      if (header && finalRowValues[index] !== undefined) {
        insertedData[header] = finalRowValues[index]
      }
    })

    return {
      success: true,
      output: {
        rowNumber: result.updates?.updatedRows || 1,
        range: result.updates?.updatedRange || range,
        values: insertedData,
        timestamp: new Date().toISOString(),
        spreadsheetId: spreadsheetId,
        sheetName: sheetName
      },
      message: `Successfully added row to ${sheetName}`
    }

  } catch (error: any) {
    console.error("Google Sheets create row error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while creating the row"
    }
  }
}