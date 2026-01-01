import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

import { logger } from '@/lib/utils/logger'
import { parseSheetName } from './utils'

/**
 * Updates a specific cell value in a Google Sheet
 */
export async function updateGoogleSheetsCell(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "google-sheets")

    const spreadsheetId = resolveValue(config.spreadsheetId, input)
    const sheetName = parseSheetName(resolveValue(config.sheetName, input))
    const cellAddress = resolveValue(config.cellAddress, input)
    const value = resolveValue(config.value, input)

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

    logger.debug("Updating Google Sheets cell:", {
      spreadsheetId,
      sheetName,
      cellAddress,
      value
    })

    // Build the range with sheet name
    const range = `${sheetName}!${cellAddress}`

    // Update the cell
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: [[value !== undefined && value !== null ? value : ""]],
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        `Failed to update cell: ${response.status} - ${errorData.error?.message || response.statusText}`
      )
    }

    const result = await response.json()

    return {
      success: true,
      output: {
        cellAddress: cellAddress,
        value: value,
        range: result.updatedRange,
        updatedCells: result.updatedCells,
        spreadsheetId: spreadsheetId,
        sheetName: sheetName,
        timestamp: new Date().toISOString()
      },
      message: `Successfully updated cell ${cellAddress} in ${sheetName}`
    }

  } catch (error: any) {
    logger.error("Google Sheets update cell error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while updating the cell"
    }
  }
}
