import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

import { logger } from '@/lib/utils/logger'
import { parseSheetName } from './utils'

/**
 * Retrieves the value from a specific cell in a Google Sheet
 */
export async function getGoogleSheetsCellValue(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "google-sheets")

    const spreadsheetId = resolveValue(config.spreadsheetId, input)
    const sheetName = parseSheetName(resolveValue(config.sheetName, input))
    const cellAddress = resolveValue(config.cellAddress, input)

    if (!spreadsheetId) {
      return { success: false, message: "Spreadsheet ID is required" }
    }

    if (!sheetName) {
      return { success: false, message: "Sheet name is required" }
    }

    if (!cellAddress) {
      return { success: false, message: "Cell address is required (e.g., A1, B5)" }
    }

    // Validate cell address format (e.g., A1, AA10, etc.)
    const cellAddressRegex = /^[A-Za-z]+[0-9]+$/
    if (!cellAddressRegex.test(cellAddress)) {
      return {
        success: false,
        message: `Invalid cell address format: "${cellAddress}". Use format like A1, B5, AA10`
      }
    }

    logger.debug("Getting Google Sheets cell value:", {
      spreadsheetId,
      sheetName,
      cellAddress
    })

    // Build the range with sheet name
    const range = `${sheetName}!${cellAddress}`

    // Fetch the cell value
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        `Failed to get cell value: ${response.status} - ${errorData.error?.message || response.statusText}`
      )
    }

    const result = await response.json()
    const value = result.values?.[0]?.[0] ?? ""

    // Also get the unformatted value for comparison
    const unformattedResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    let unformattedValue = value
    if (unformattedResponse.ok) {
      const unformattedResult = await unformattedResponse.json()
      unformattedValue = unformattedResult.values?.[0]?.[0] ?? ""
    }

    return {
      success: true,
      output: {
        value: value,
        rawValue: unformattedValue,
        formattedValue: value,
        cellAddress: cellAddress,
        range: result.range,
        isEmpty: value === "" || value === undefined || value === null,
        spreadsheetId: spreadsheetId,
        sheetName: sheetName,
        timestamp: new Date().toISOString()
      },
      message: `Successfully retrieved value from ${cellAddress}: "${value}"`
    }

  } catch (error: any) {
    logger.error("Google Sheets get cell value error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while getting the cell value"
    }
  }
}
