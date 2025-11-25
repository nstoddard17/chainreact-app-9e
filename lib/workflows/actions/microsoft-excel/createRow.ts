import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

import { logger } from '@/lib/utils/logger'

/**
 * Creates a new row in a Microsoft Excel worksheet using the Microsoft Graph API
 */
export async function createMicrosoftExcelRow(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration with workflow variables
    const resolvedConfig = resolveValue(config, input)
    let { workbookId, worksheetName, insertPosition = 'append', specificRow, columnMapping } = resolvedConfig

    // Transform columnMapping from array format to object format if needed
    // The UI component (MicrosoftExcelColumnMapper) outputs: [{ column: "Name", value: "John" }]
    // But we need: { "Name": "John" }
    if (Array.isArray(columnMapping)) {
      logger.debug('📊 [Excel Create Row] Converting array format to object format');
      const mappingObject: Record<string, any> = {};
      for (const item of columnMapping) {
        if (item && item.column && item.value !== undefined) {
          mappingObject[item.column] = item.value;
        }
      }
      columnMapping = mappingObject;
    }

    // Get access token for Microsoft Excel (Microsoft Graph API)
    const accessToken = await getDecryptedAccessToken(userId, 'microsoft-excel')
    if (!accessToken) {
      throw new Error('No Microsoft Excel access token found. Please connect your Microsoft Excel account.')
    }

    // Validate required fields
    if (!workbookId) {
      throw new Error('Workbook ID is required')
    }
    if (!worksheetName) {
      throw new Error('Worksheet name is required')
    }
    if (!columnMapping || Object.keys(columnMapping).length === 0) {
      throw new Error('Column mapping is required')
    }

    // Microsoft Graph API base URL
    const baseUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${workbookId}/workbook`

    // The columnMapping should already be in the correct order from the column mapper UI
    // Extract values in the order they appear in the mapping object
    const values: any[] = []

    logger.debug('📊 [Excel Create Row] Column mapping received:', columnMapping)
    logger.debug('📊 [Excel Create Row] Mapping order:', Object.keys(columnMapping))

    for (const [columnName, value] of Object.entries(columnMapping)) {
      values.push(value || '')
      logger.debug(`  Column "${columnName}" -> value: "${value}"`)
    }

    logger.debug('📊 [Excel Create Row] Final values array (length:', values.length, '):', values)

    // Determine where to insert the row
    let rangeAddress = ''
    const columnCount = values.length
    const endColumn = String.fromCharCode(65 + columnCount - 1) // A=65, so A+0=A, A+1=B, etc.

    if (insertPosition === 'append') {
      // Append at the end of the data
      rangeAddress = `${worksheetName}!A:A` // Will find the last row automatically
    } else if (insertPosition === 'prepend') {
      // Insert at row 2 (after headers)
      rangeAddress = `${worksheetName}!A2:${endColumn}2`
    } else if (insertPosition === 'specific_row' && specificRow) {
      // Insert at specific row
      rangeAddress = `${worksheetName}!A${specificRow}:${endColumn}${specificRow}`
    }

    // For appending, we need to find the last used row first
    if (insertPosition === 'append') {
      // Get the used range to find where to append
      const usedRangeResponse = await fetch(
        `${baseUrl}/worksheets('${worksheetName}')/usedRange?$select=address`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (usedRangeResponse.ok) {
        const usedRange = await usedRangeResponse.json()
        // Parse the range to find the last row
        const match = usedRange.address?.match(/:([A-Z]+)(\d+)/)
        if (match) {
          const lastRow = parseInt(match[2])
          const nextRow = lastRow + 1
          rangeAddress = `${worksheetName}!A${nextRow}:${endColumn}${nextRow}`
        }
      } else {
        // If no used range, start at row 2
        rangeAddress = `${worksheetName}!A2:${endColumn}2`
      }
    }

    // Insert or prepend requires different handling
    if (insertPosition === 'prepend' || insertPosition === 'specific_row') {
      // First, insert a blank row at the position
      const insertUrl = `${baseUrl}/worksheets('${worksheetName}')/range(address='${rangeAddress}')/insert`
      const insertResponse = await fetch(insertUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          shift: 'Down'
        })
      })

      if (!insertResponse.ok) {
        const error = await insertResponse.text()
        throw new Error(`Failed to insert row: ${error}`)
      }
    }

    // Now update the range with the values
    const updateUrl = `${baseUrl}/worksheets('${worksheetName}')/range(address='${rangeAddress}')`
    const updateResponse = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [values]
      })
    })

    if (!updateResponse.ok) {
      const error = await updateResponse.text()
      throw new Error(`Failed to add row: ${error}`)
    }

    const result = await updateResponse.json()

    return {
      success: true,
      output: {
        workbookId,
        worksheetName,
        range: result.address || rangeAddress,
        values: [values],
        timestamp: new Date().toISOString()
      },
      message: `Successfully added row to ${worksheetName}`
    }

  } catch (error: any) {
    logger.error('❌ [Microsoft Excel Create Row] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create row in Excel'
    }
  }
}