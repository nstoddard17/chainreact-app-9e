import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

import { logger } from '@/lib/utils/logger'

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

    logger.debug("Resolved create row values:", {
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
      logger.error(message)
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
    
    logger.debug("📊 Raw headers from Google Sheets:", headers)
    logger.debug("📊 Headers with indices:")
    headers.forEach((h: string, i: number) => {
      logger.debug(`  [${i}] "${h}" (length: ${h.length})`);
    })

    // Map field values to column positions - ensure array length matches headers exactly
    const rowValues: any[] = new Array(headers.length).fill(undefined)
    
    logger.debug("🔍 Processing fieldMapping entries:")
    for (const [columnIdentifier, value] of Object.entries(fieldMapping)) {
      const resolvedValue = value !== undefined && value !== null && value !== '' ? resolveValue(value, input) : ''
      
      // Check if columnIdentifier is a SINGLE column letter (A-Z only, not AA, AB, etc.)
      // and NOT a word like "Address" or "RSVP"
      if (/^[A-Z]$/i.test(columnIdentifier)) {
        const index = columnIdentifier.toUpperCase().charCodeAt(0) - 65
        logger.debug(`  Letter column "${columnIdentifier}" -> index ${index} -> value: "${resolvedValue}"`)
        if (index < headers.length) {
          rowValues[index] = resolvedValue
        }
      } else {
        // Find by header name - exact match
        const headerIndex = headers.findIndex((h: string) => h === columnIdentifier)
        logger.debug(`  Named column "${columnIdentifier}" -> index ${headerIndex} -> value: "${resolvedValue}"`)
        if (headerIndex >= 0) {
          rowValues[headerIndex] = resolvedValue
        } else {
          logger.debug(`    ⚠️ Column "${columnIdentifier}" not found in headers!`)
          // Try trimmed match
          const trimmedIndex = headers.findIndex((h: string) => h.trim() === columnIdentifier.trim())
          if (trimmedIndex >= 0) {
            logger.debug(`    ✓ Found with trimmed match at index ${trimmedIndex}`)
            rowValues[trimmedIndex] = resolvedValue
          }
        }
      }
    }

    // Replace undefined values with empty strings - maintain exact array length
    const finalRowValues = rowValues.map(v => v === undefined ? '' : v)
    
    logger.debug("📊 Final row values by position:")
    finalRowValues.forEach((value, index) => {
      const header = headers[index] || `Column ${index}`
      logger.debug(`  [${index}] ${header}: "${value}"`);
    })
    
    logger.debug("🔍 Google Sheets Create Row - Column Mapping Summary:", {
      headersLength: headers.length,
      fieldMappingKeys: Object.keys(fieldMapping),
      finalRowValuesLength: finalRowValues.length,
      insertPosition
    })
    
    // Log each mapping explicitly
    Object.entries(fieldMapping).forEach(([column, value]) => {
      const headerIndex = headers.findIndex((h: string) => h === column)
      logger.debug(`  Column "${column}" -> Index ${headerIndex} -> Value: "${value}"`)
      if (headerIndex === -1) {
        logger.debug(`    ⚠️ WARNING: Column "${column}" not found in headers!`)
        // Try case-insensitive match
        const caseInsensitiveIndex = headers.findIndex((h: string) => h.toLowerCase() === column.toLowerCase())
        if (caseInsensitiveIndex >= 0) {
          logger.debug(`    ℹ️ Found case-insensitive match at index ${caseInsensitiveIndex}`)
        }
      }
    })
    
    logger.debug("📊 Headers from sheet:", headers)
    logger.debug("📊 Field names from UI:", Object.keys(fieldMapping))

    // Get sheet metadata if we need to insert at beginning or specific row
    let sheetId: number | undefined
    if (insertPosition === 'prepend' || insertPosition === 'specific_row') {
      const metadataResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
      
      if (!metadataResponse.ok) {
        throw new Error(`Failed to fetch spreadsheet metadata: ${metadataResponse.status}`)
      }
      
      const spreadsheetData = await metadataResponse.json()
      const sheet = spreadsheetData.sheets?.find((s: any) => s.properties?.title === sheetName)
      
      if (!sheet) {
        throw new Error(`Sheet "${sheetName}" not found in spreadsheet`)
      }
      
      sheetId = sheet.properties.sheetId
    }

    // Determine the range based on insert position
    let range = sheetName
    let insertDataOption = 'INSERT_ROWS'
    let apiMethod = 'append'
    
    if (insertPosition === 'append') {
      range = `${sheetName}!A:A` // Append to end
      insertDataOption = 'INSERT_ROWS'
      apiMethod = 'append'
    } else if (insertPosition === 'prepend' && sheetId !== undefined) {
      // For prepend, we need to use batchUpdate to insert a row at position 2
      // First, insert a blank row at position 2
      const insertRowResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requests: [{
              insertDimension: {
                range: {
                  sheetId: sheetId,
                  dimension: "ROWS",
                  startIndex: 1, // After header row (0-indexed)
                  endIndex: 2 // Insert 1 row
                },
                inheritFromBefore: false
              }
            }]
          }),
        }
      )
      
      if (!insertRowResponse.ok) {
        const errorData = await insertRowResponse.json().catch(() => ({}))
        throw new Error(`Failed to insert row: ${insertRowResponse.status} - ${errorData.error?.message || insertRowResponse.statusText}`)
      }
      
      // Now update the newly inserted row with our data
      // Use the same approach as append - just specify the row
      range = `${sheetName}!2:2`
      apiMethod = 'update'
    } else if (insertPosition === 'specific_row' && specificRow && sheetId !== undefined) {
      // For specific row, insert a blank row at that position first
      const insertRowResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requests: [{
              insertDimension: {
                range: {
                  sheetId: sheetId,
                  dimension: "ROWS",
                  startIndex: Number(specificRow) - 1, // Convert to 0-indexed
                  endIndex: Number(specificRow) // Insert 1 row
                },
                inheritFromBefore: false
              }
            }]
          }),
        }
      )
      
      if (!insertRowResponse.ok) {
        const errorData = await insertRowResponse.json().catch(() => ({}))
        throw new Error(`Failed to insert row: ${insertRowResponse.status} - ${errorData.error?.message || insertRowResponse.statusText}`)
      }
      
      // Use the same approach as append - just specify the row
      range = `${sheetName}!${specificRow}:${specificRow}`
      apiMethod = 'update'
    }

    // Insert or update the row data
    const endpoint = apiMethod === 'append' 
      ? `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=${insertDataOption}`
      : `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`
      
    const response = await fetch(endpoint, {
      method: apiMethod === 'append' ? "POST" : "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [finalRowValues],
      }),
    })

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
    logger.error("Google Sheets create row error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while creating the row"
    }
  }
}