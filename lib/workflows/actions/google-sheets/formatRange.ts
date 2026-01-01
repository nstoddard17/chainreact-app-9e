import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'
import { parseSheetName } from './utils'

/**
 * Applies formatting to a range in a Google Sheets spreadsheet
 * Supports colors, fonts, alignment, and borders
 */
export async function formatGoogleSheetsRange(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "google-sheets")

    const spreadsheetId = resolveValue(config.spreadsheetId, input)
    const sheetName = parseSheetName(resolveValue(config.sheetName, input))
    const rangeSelection = resolveValue(config.rangeSelection, input) || 'custom'

    if (!spreadsheetId || !sheetName) {
      const missingFields = []
      if (!spreadsheetId) missingFields.push("Spreadsheet ID")
      if (!sheetName) missingFields.push("Sheet Name")

      const message = `Missing required fields for formatting range: ${missingFields.join(", ")}`
      logger.error(message)
      return { success: false, message }
    }

    // Get sheet ID for formatting API
    const sheetMetadataResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=false`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!sheetMetadataResponse.ok) {
      throw new Error(`Failed to fetch sheet metadata: ${sheetMetadataResponse.status}`)
    }

    const spreadsheetData = await sheetMetadataResponse.json()
    const sheet = spreadsheetData.sheets?.find((s: any) => s.properties.title === sheetName)

    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" not found in spreadsheet`)
    }

    const sheetId = sheet.properties.sheetId

    let rangeToFormat: string
    let gridRange: any = { sheetId }

    // Determine the range based on rangeSelection
    if (rangeSelection === 'custom') {
      const range = resolveValue(config.range, input)
      if (!range) {
        return { success: false, message: "Range is required when range selection is 'custom'" }
      }
      rangeToFormat = `${sheetName}!${range}`

      // Parse A1 notation to grid range (e.g., A1:D10 → startRow: 0, endRow: 10, startCol: 0, endCol: 4)
      const match = range.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/)
      if (match) {
        const colToNum = (col: string) => {
          let num = 0
          for (let i = 0; i < col.length; i++) {
            num = num * 26 + col.charCodeAt(i) - 64
          }
          return num - 1 // 0-indexed
        }

        gridRange.startRowIndex = parseInt(match[2]) - 1
        gridRange.endRowIndex = parseInt(match[4])
        gridRange.startColumnIndex = colToNum(match[1])
        gridRange.endColumnIndex = colToNum(match[3]) + 1
      }
    } else if (rangeSelection === 'entire_sheet') {
      rangeToFormat = `${sheetName}`
      // Grid range with only sheetId applies to entire sheet
    } else if (rangeSelection === 'header_row') {
      rangeToFormat = `${sheetName}!1:1`
      gridRange.startRowIndex = 0
      gridRange.endRowIndex = 1
    } else if (rangeSelection === 'first_data_row') {
      rangeToFormat = `${sheetName}!2:2`
      gridRange.startRowIndex = 1
      gridRange.endRowIndex = 2
    } else if (rangeSelection === 'last_row') {
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
          message: "Sheet is empty, no last row to format"
        }
      }

      const lastRowNumber = values.length
      rangeToFormat = `${sheetName}!${lastRowNumber}:${lastRowNumber}`
      gridRange.startRowIndex = lastRowNumber - 1
      gridRange.endRowIndex = lastRowNumber

      logger.debug("Formatting last row:", { lastRowNumber, range: rangeToFormat })
    } else {
      return {
        success: false,
        error: `Invalid range selection: ${rangeSelection}`
      }
    }

    logger.debug("Formatting Google Sheets range:", {
      spreadsheetId,
      sheetName,
      rangeSelection,
      rangeToFormat,
      gridRange
    })

    // Build formatting requests
    const requests: any[] = []
    const cellFormat: any = {}

    // Background color
    const backgroundColor = resolveValue(config.backgroundColor, input)
    if (backgroundColor) {
      const rgb = hexToRgb(backgroundColor)
      if (rgb) {
        cellFormat.backgroundColor = rgb
      }
    }

    // Text color
    const textColor = resolveValue(config.textColor, input)
    if (textColor) {
      const rgb = hexToRgb(textColor)
      if (rgb) {
        cellFormat.textFormat = cellFormat.textFormat || {}
        cellFormat.textFormat.foregroundColor = rgb
      }
    }

    // Bold
    const bold = resolveValue(config.bold, input)
    if (bold !== undefined && bold !== null) {
      cellFormat.textFormat = cellFormat.textFormat || {}
      cellFormat.textFormat.bold = bold === true || bold === 'true'
    }

    // Italic
    const italic = resolveValue(config.italic, input)
    if (italic !== undefined && italic !== null) {
      cellFormat.textFormat = cellFormat.textFormat || {}
      cellFormat.textFormat.italic = italic === true || italic === 'true'
    }

    // Font size
    const fontSize = resolveValue(config.fontSize, input)
    if (fontSize) {
      cellFormat.textFormat = cellFormat.textFormat || {}
      cellFormat.textFormat.fontSize = parseInt(fontSize.toString())
    }

    // Horizontal alignment
    const horizontalAlignment = resolveValue(config.horizontalAlignment, input)
    if (horizontalAlignment) {
      cellFormat.horizontalAlignment = horizontalAlignment
    }

    // Vertical alignment
    const verticalAlignment = resolveValue(config.verticalAlignment, input)
    if (verticalAlignment) {
      cellFormat.verticalAlignment = verticalAlignment
    }

    // Text wrapping
    const textWrapping = resolveValue(config.textWrapping, input)
    if (textWrapping) {
      cellFormat.wrapStrategy = textWrapping
    }

    // Strikethrough
    const strikethrough = resolveValue(config.strikethrough, input)
    if (strikethrough !== undefined && strikethrough !== null) {
      cellFormat.textFormat = cellFormat.textFormat || {}
      cellFormat.textFormat.strikethrough = strikethrough === true || strikethrough === 'true'
    }

    // Underline
    const underline = resolveValue(config.underline, input)
    if (underline !== undefined && underline !== null) {
      cellFormat.textFormat = cellFormat.textFormat || {}
      cellFormat.textFormat.underline = underline === true || underline === 'true'
    }

    // Only send request if we have formatting to apply
    if (Object.keys(cellFormat).length === 0) {
      return {
        success: false,
        message: "No formatting options specified. Please select at least one formatting option."
      }
    }

    requests.push({
      repeatCell: {
        range: gridRange,
        cell: {
          userEnteredFormat: cellFormat
        },
        fields: Object.keys(cellFormat).map(key => {
          if (key === 'textFormat') {
            return 'userEnteredFormat.textFormat'
          }
          return `userEnteredFormat.${key}`
        }).join(',')
      }
    })

    // Execute batch update
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requests }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to format range: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }

    const result = await response.json()

    return {
      success: true,
      output: {
        formattedRange: rangeToFormat,
        success: true,
        rangeSelection: rangeSelection,
        appliedFormatting: cellFormat,
        spreadsheetId: spreadsheetId,
        sheetName: sheetName,
        timestamp: new Date().toISOString()
      },
      message: `Successfully formatted ${rangeSelection === 'custom' ? 'range' : rangeSelection.replace('_', ' ')} in ${sheetName}`
    }

  } catch (error: any) {
    logger.error("Google Sheets format range error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while formatting the range"
    }
  }
}

/**
 * Convert hex color to Google Sheets RGB format
 * @param hex Hex color string (e.g., "#FF5733" or "FF5733")
 * @returns RGB object with red, green, blue values (0-1 range)
 */
function hexToRgb(hex: string): { red: number; green: number; blue: number } | null {
  // Remove # if present
  hex = hex.replace(/^#/, '')

  // Parse hex values
  const bigint = parseInt(hex, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255

  // Convert to 0-1 range
  return {
    red: r / 255,
    green: g / 255,
    blue: b / 255
  }
}
