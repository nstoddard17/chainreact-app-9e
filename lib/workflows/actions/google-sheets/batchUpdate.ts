import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Updates multiple ranges in a Google Sheets spreadsheet in a single operation
 * Supports updating multiple sheets and ranges with different values
 */
export async function batchUpdateGoogleSheets(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "google-sheets")

    const spreadsheetId = resolveValue(config.spreadsheetId, input)
    const updatesInput = resolveValue(config.updates, input)

    if (!spreadsheetId) {
      const message = "Missing required field: Spreadsheet ID"
      logger.error(message)
      return { success: false, message }
    }

    if (!updatesInput) {
      const message = "Missing required field: Updates"
      logger.error(message)
      return { success: false, message }
    }

    // Parse updates (could be JSON string or already parsed array)
    let updates: Array<{ range: string; values: any[][] }>
    if (typeof updatesInput === 'string') {
      try {
        updates = JSON.parse(updatesInput)
      } catch (e) {
        logger.error('Failed to parse updates as JSON:', e)
        return {
          success: false,
          message: "Updates must be valid JSON array. Example: [{\"range\": \"Sheet1!A1\", \"values\": [[\"Value\"]]}]"
        }
      }
    } else if (Array.isArray(updatesInput)) {
      updates = updatesInput
    } else {
      return {
        success: false,
        message: "Updates must be an array of update objects"
      }
    }

    // Validate updates array
    if (!Array.isArray(updates) || updates.length === 0) {
      return {
        success: false,
        message: "Updates must be a non-empty array"
      }
    }

    // Validate each update object
    for (let i = 0; i < updates.length; i++) {
      const update = updates[i]
      if (!update.range || !update.values) {
        return {
          success: false,
          message: `Update at index ${i} is missing required 'range' or 'values' field`
        }
      }
      if (!Array.isArray(update.values)) {
        return {
          success: false,
          message: `Update at index ${i}: 'values' must be a 2D array (e.g., [["Value1", "Value2"]])`
        }
      }
      // Ensure range includes sheet name (Sheet1!A1 format)
      if (!update.range.includes('!')) {
        return {
          success: false,
          message: `Update at index ${i}: Range must include sheet name (e.g., "Sheet1!A1" or "Sheet1!A1:B2")`
        }
      }
    }

    logger.debug("Batch updating Google Sheets:", {
      spreadsheetId,
      updateCount: updates.length,
      ranges: updates.map(u => u.range)
    })

    // Prepare batch update data
    const data = updates.map(update => ({
      range: update.range,
      values: update.values
    }))

    const requestBody = {
      valueInputOption: "USER_ENTERED",
      data: data
    }

    logger.debug("Sending batch update request:", JSON.stringify(requestBody, null, 2))

    // Execute batch update
    const response = await fetch(
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

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to batch update: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }

    const result = await response.json()

    // Calculate total cells updated
    let totalCellsUpdated = 0
    if (result.responses) {
      for (const resp of result.responses) {
        totalCellsUpdated += resp.updatedCells || 0
      }
    }

    return {
      success: true,
      output: {
        updatedRanges: updates.map(u => u.range),
        totalCellsUpdated: totalCellsUpdated,
        success: true,
        updateCount: updates.length,
        responses: result.responses,
        spreadsheetId: spreadsheetId,
        timestamp: new Date().toISOString()
      },
      message: `Successfully updated ${updates.length} range(s) with ${totalCellsUpdated} total cells modified`
    }

  } catch (error: any) {
    logger.error("Google Sheets batch update error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while batch updating the spreadsheet"
    }
  }
}
