import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'

import { logger } from '@/lib/utils/logger'

/**
 * Reads data from a Google Sheets spreadsheet
 * Supports different output formats (objects, array, raw)
 */
export async function readGoogleSheetsData(
  config: any, 
  userId: string, 
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "google-sheets")
    
    // Get spreadsheet and sheet details from config
    const spreadsheetId = resolveValue(config.spreadsheetId, input)
    const sheetName = resolveValue(config.sheetName, input) || config.sheetId
    const range = resolveValue(config.range, input) || "A1:Z1000"
    const outputFormat = config.outputFormat || "objects" // objects, array, raw
    
    if (!spreadsheetId) {
      return { success: false, message: "Spreadsheet ID is required" }
    }
    
    let rangeParam = range
    if (sheetName) {
      // If sheet name contains spaces or special characters, it needs to be quoted
      const formattedSheetName = sheetName.includes(' ') || /[^\w]/.test(sheetName)
        ? `'${sheetName}'`
        : sheetName
      
      rangeParam = `${formattedSheetName}!${range}`
    }
    
    logger.debug(`Reading Google Sheets data from ${spreadsheetId}, range: ${rangeParam}`)
    
    // Fetch the data from Google Sheets API
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeParam)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    )
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || `Failed to read Google Sheets data: ${response.status}`)
    }
    
    const result = await response.json()
    const values = result.values || []
    
    if (values.length === 0) {
      return {
        success: true,
        output: {
          ...input,
          data: [],
          format: outputFormat,
          rowsRead: 0,
        },
        message: "No data found in the specified range",
      }
    }
    
    let formattedData
    
    if (outputFormat === "raw") {
      // Return the raw data as-is
      formattedData = values
    } else if (outputFormat === "array") {
      // Return as array of arrays (same as raw)
      formattedData = values
    } else {
      // Default: return as array of objects using first row as headers
      const headers = values[0]
      formattedData = values.slice(1).map((row: any[]) => {
        const obj: Record<string, any> = {}
        row.forEach((cell: any, index: number) => {
          if (index < headers.length) {
            obj[headers[index]] = cell
          }
        })
        return obj
      })
    }
    
    return {
      success: true,
      output: {
        ...input,
        data: formattedData,
        format: outputFormat,
        rowsRead: outputFormat === "objects" ? values.length - 1 : values.length,
        headers: outputFormat === "objects" ? values[0] : undefined,
      },
      message: `Successfully read ${formattedData.length} rows from Google Sheets`,
    }
  } catch (error: any) {
    logger.error("Google Sheets read data error:", error)
    return {
      success: false,
      message: `Failed to read Google Sheets data: ${error.message}`,
      error: error.message,
    }
  }
} 