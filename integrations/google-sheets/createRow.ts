/**
 * Google Sheets Create Row Action Handler
 * 
 * Creates a new row in a Google Sheets spreadsheet using the Google Sheets API
 */

import { getIntegrationCredentials } from "@/lib/integrations/getDecryptedAccessToken"
import { resolveValue } from "@/lib/integrations/resolveValue"

/**
 * Action metadata for UI display and reference
 */
export const ACTION_METADATA = {
  key: "google-sheets_action_create_row",
  name: "Create Google Sheets Row",
  description: "Add a new row to a Google Sheets spreadsheet",
  icon: "file-spreadsheet"
};

/**
 * Standard interface for action parameters
 */
export interface ActionParams {
  userId: string
  config: Record<string, any>
  input: Record<string, any>
}

/**
 * Standard interface for action results
 */
export interface ActionResult {
  success: boolean
  output?: Record<string, any>
  message?: string
  error?: string
}

/**
 * Creates a new row in Google Sheets
 * 
 * @param params - Standard action parameters
 * @returns Action result with success/failure and any outputs
 */
export async function createGoogleSheetsRow(params: ActionParams): Promise<ActionResult> {
  try {
    const { userId, config, input } = params
    
    // 1. Get Google Sheets OAuth token
    const credentials = await getIntegrationCredentials(userId, "google-sheets")
    
    // 2. Resolve any templated values in the config
    const resolvedConfig = resolveValue(config, {
      input,
    })
    
    // 3. Extract required parameters
    const { 
      spreadsheetId,
      sheetName,
      values,
      insertDataOption = "INSERT_ROWS"
    } = resolvedConfig
    
    // 4. Validate required parameters
    if (!spreadsheetId) {
      return {
        success: false,
        error: "Missing required parameter: spreadsheetId"
      }
    }
    
    if (!sheetName) {
      return {
        success: false,
        error: "Missing required parameter: sheetName"
      }
    }
    
    if (!values || !Array.isArray(values)) {
      return {
        success: false,
        error: "Missing required parameter: values (must be an array)"
      }
    }
    
    // 5. Prepare the request payload
    const payload = {
      values: [values], // Wrap in array as API expects 2D array
      insertDataOption
    }
    
    // 6. Make Google Sheets API request
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}:append?valueInputOption=USER_ENTERED`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    
    // 7. Handle API response
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Google Sheets API error (${response.status}): ${errorText}`)
    }
    
    const data = await response.json()
    
    // 8. Return success result with any outputs
    return {
      success: true,
      output: {
        updatedRange: data.updates?.updatedRange,
        updatedRows: data.updates?.updatedRows,
        updatedColumns: data.updates?.updatedColumns,
        updatedCells: data.updates?.updatedCells,
        spreadsheetId: data.updates?.spreadsheetId
      },
      message: `Row added successfully to ${sheetName}`
    }
    
  } catch (error: any) {
    // 9. Handle errors and return failure result
    console.error("Google Sheets create row failed:", error)
    return {
      success: false,
      error: error.message || "Failed to create Google Sheets row"
    }
  }
} 