import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

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
    const resolvedConfig = resolveValue(config, { input })
    const { workbookId, worksheetName, insertPosition = 'append', specificRow, fieldMapping } = resolvedConfig

    // Get access token for OneDrive (Microsoft Graph API)
    const accessToken = await getDecryptedAccessToken(userId, 'onedrive')
    if (!accessToken) {
      throw new Error('No OneDrive access token found. Please connect your OneDrive account.')
    }

    // Validate required fields
    if (!workbookId) {
      throw new Error('Workbook ID is required')
    }
    if (!worksheetName) {
      throw new Error('Worksheet name is required')
    }
    if (!fieldMapping || Object.keys(fieldMapping).length === 0) {
      throw new Error('Field mapping is required')
    }

    // Microsoft Graph API base URL
    const baseUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${workbookId}/workbook`

    // The fieldMapping should already be in the correct order from the column mapper UI
    // Extract values in the order they appear in the mapping object
    const values: any[] = []

    console.log('📊 [Excel Create Row] Field mapping received:', fieldMapping)
    console.log('📊 [Excel Create Row] Mapping order:', Object.keys(fieldMapping))

    for (const [columnName, value] of Object.entries(fieldMapping)) {
      values.push(value || '')
      console.log(`  Column "${columnName}" -> value: "${value}"`)
    }

    console.log('📊 [Excel Create Row] Final values array (length:', values.length, '):', values)

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
    console.error('❌ [Microsoft Excel Create Row] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create row in Excel'
    }
  }
}