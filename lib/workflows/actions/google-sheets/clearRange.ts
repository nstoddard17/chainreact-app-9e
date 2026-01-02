import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'
import { parseSheetName } from './utils'

/**
 * Clears a range, last row, or specific row in a Google Sheets spreadsheet
 * Can clear content, formatting, or both
 */
export async function clearGoogleSheetsRange(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "google-sheets")

    const spreadsheetId = resolveValue(config.spreadsheetId, input)
    const sheetName = parseSheetName(resolveValue(config.sheetName, input))
    const clearType = resolveValue(config.clearType, input) || 'range'
    const whatToClear = resolveValue(config.whatToClear, input) || 'content'

    if (!spreadsheetId || !sheetName) {
      const missingFields = []
      if (!spreadsheetId) missingFields.push("Spreadsheet ID")
      if (!sheetName) missingFields.push("Sheet Name")

      const message = `Missing required fields for clearing range: ${missingFields.join(", ")}`
      logger.error(message)
      return { success: false, message }
    }

    let rangeToClean: string
    let sheetId: number | null = null

    // Determine the range based on clear type
    if (clearType === 'range') {
      const range = resolveValue(config.range, input)
      if (!range) {
        return { success: false, message: "Range is required when clear type is 'range'" }
      }
      rangeToClean = `${sheetName}!${range}`
    } else if (clearType === 'last_row') {
      // Get all rows to determine the last row
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

      const dataResult = await dataResponse.json()
      const values = dataResult.values || []

      if (values.length === 0) {
        return {
          success: false,
          message: "Sheet is empty, no last row to clear"
        }
      }

      const lastRowNumber = values.length
      rangeToClean = `${sheetName}!${lastRowNumber}:${lastRowNumber}`

      logger.debug("Clearing last row:", { lastRowNumber, range: rangeToClean })
    } else if (clearType === 'specific_row') {
      const rowNumber = resolveValue(config.rowNumber, input)
      if (!rowNumber) {
        return { success: false, message: "Row number is required when clear type is 'specific_row'" }
      }
      rangeToClean = `${sheetName}!${rowNumber}:${rowNumber}`

      logger.debug("Clearing specific row:", { rowNumber, range: rangeToClean })
    } else {
      return {
        success: false,
        error: `Invalid clear type: ${clearType}. Must be 'range', 'last_row', or 'specific_row'`
      }
    }

    logger.debug("Clearing Google Sheets range:", {
      spreadsheetId,
      sheetName,
      clearType,
      whatToClear,
      rangeToClean
    })

    // If we need to clear formatting, we need the sheet ID
    if (whatToClear === 'format' || whatToClear === 'both') {
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
        throw new Error(`Sheet "${sheetName}" not found in spreadsheet`)
      }

      sheetId = sheet.properties.sheetId
    }

    let result: any = {}

    // Clear content if requested
    if (whatToClear === 'content' || whatToClear === 'both') {
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeToClean)}:clear`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to clear content: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }

      result = await response.json()
    }

    // Clear formatting if requested
    if (whatToClear === 'format' || whatToClear === 'both') {
      if (sheetId === null) {
        throw new Error('Sheet ID is required for clearing formatting')
      }

      // Parse the range to get grid coordinates
      const rangeMatch = rangeToClean.match(/!([A-Z]+)?(\d+)?:?([A-Z]+)?(\d+)?/)
      if (!rangeMatch) {
        throw new Error(`Invalid range format: ${rangeToClean}`)
      }

      const startCol = rangeMatch[1] || 'A'
      const startRow = rangeMatch[2] ? parseInt(rangeMatch[2]) : 1
      const endCol = rangeMatch[3] || 'ZZ'
      const endRow = rangeMatch[4] ? parseInt(rangeMatch[4]) : 1000

      // Convert column letters to numbers
      const colToNum = (col: string) => {
        let num = 0
        for (let i = 0; i < col.length; i++) {
          num = num * 26 + col.charCodeAt(i) - 64
        }
        return num - 1 // 0-indexed for API
      }

      const gridRange = {
        sheetId: sheetId,
        startRowIndex: startRow - 1,
        endRowIndex: endRow,
        startColumnIndex: colToNum(startCol),
        endColumnIndex: colToNum(endCol) + 1
      }

      const batchUpdateRequest = {
        requests: [
          {
            repeatCell: {
              range: gridRange,
              fields: 'userEnteredFormat'
            }
          }
        ]
      }

      const formatResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(batchUpdateRequest)
        }
      )

      if (!formatResponse.ok) {
        const errorData = await formatResponse.json().catch(() => ({}))
        throw new Error(`Failed to clear formatting: ${formatResponse.status} - ${errorData.error?.message || formatResponse.statusText}`)
      }

      const formatResult = await formatResponse.json()
      result.formattingCleared = true
    }

    // Calculate approximate cells cleared
    let cellsCleared = 0
    if (result.clearedRange) {
      // Parse range to estimate cells (rough approximation)
      const rangeMatch = result.clearedRange.match(/!([A-Z]+)(\d+):([A-Z]+)(\d+)/)
      if (rangeMatch) {
        const startCol = rangeMatch[1]
        const startRow = parseInt(rangeMatch[2])
        const endCol = rangeMatch[3]
        const endRow = parseInt(rangeMatch[4])

        // Convert column letters to numbers for calculation
        const colToNum = (col: string) => {
          let num = 0
          for (let i = 0; i < col.length; i++) {
            num = num * 26 + col.charCodeAt(i) - 64
          }
          return num
        }

        const cols = colToNum(endCol) - colToNum(startCol) + 1
        const rows = endRow - startRow + 1
        cellsCleared = cols * rows
      }
    }

    const whatCleared = whatToClear === 'both'
      ? 'content and formatting'
      : whatToClear === 'format'
        ? 'formatting'
        : 'content'

    const rangeDescription = clearType === 'last_row'
      ? 'last row'
      : clearType === 'specific_row'
        ? `row ${config.rowNumber}`
        : 'range'

    return {
      success: true,
      output: {
        clearedRange: result.clearedRange || rangeToClean,
        cellsCleared: cellsCleared,
        clearType: clearType,
        whatToClear: whatToClear,
        contentCleared: whatToClear === 'content' || whatToClear === 'both',
        formattingCleared: whatToClear === 'format' || whatToClear === 'both',
        spreadsheetId: spreadsheetId,
        sheetName: sheetName,
        success: true,
        timestamp: new Date().toISOString()
      },
      message: `Successfully cleared ${whatCleared} from ${rangeDescription} in ${sheetName}`
    }

  } catch (error: any) {
    logger.error("Google Sheets clear range error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while clearing the range"
    }
  }
}
