import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

/**
 * Updates a row in a Microsoft Excel worksheet using the Microsoft Graph API
 */
export async function updateMicrosoftExcelRow(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    console.log('📊 [Excel Update Row] Starting with config:', config);

    // Resolve configuration with workflow variables
    const resolvedConfig = resolveValue(config, { input })
    const {
      workbookId,
      worksheetName,
      rowNumber,
      matchColumn,
      matchValue,
      updateMapping,
      updateMultiple = false
    } = resolvedConfig

    console.log('📊 [Excel Update Row] Resolved config:', {
      workbookId,
      worksheetName,
      rowNumber,
      updateMapping,
      updateMappingKeys: updateMapping ? Object.keys(updateMapping) : 'undefined'
    });

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

    // Validate updateMapping
    if (!updateMapping || Object.keys(updateMapping).length === 0) {
      throw new Error('No fields to update. Please modify at least one field value.')
    }

    // Microsoft Graph API base URL
    const baseUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${workbookId}/workbook`

    let rowsToUpdate: number[] = []
    const updatedRanges: string[] = []

    // If row number is specified directly
    if (rowNumber) {
      rowsToUpdate = [rowNumber]
    }
    // If we need to find rows by column value
    else if (matchColumn && matchValue !== undefined) {
      // Get all data from the worksheet to find matching rows
      const dataResponse = await fetch(
        `${baseUrl}/worksheets('${worksheetName}')/usedRange`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!dataResponse.ok) {
        const error = await dataResponse.text()
        throw new Error(`Failed to fetch worksheet data: ${error}`)
      }

      const data = await dataResponse.json()
      const values = data.values || []

      if (values.length === 0) {
        throw new Error('No data found in worksheet')
      }

      // Find column index
      const headers = values[0] || []
      const columnIndex = headers.findIndex((h: string) => h === matchColumn)

      if (columnIndex === -1) {
        throw new Error(`Column "${matchColumn}" not found in worksheet`)
      }

      // Find matching rows (skip header row)
      for (let i = 1; i < values.length; i++) {
        const row = values[i]
        if (row[columnIndex] === matchValue) {
          rowsToUpdate.push(i + 1) // Excel rows are 1-indexed
          if (!updateMultiple) {
            break // Only update first match if not updating multiple
          }
        }
      }

      if (rowsToUpdate.length === 0) {
        throw new Error(`No rows found matching "${matchValue}" in column "${matchColumn}"`)
      }
    } else {
      throw new Error('Either rowNumber or matchColumn/matchValue must be provided')
    }

    // Update each row
    for (const row of rowsToUpdate) {
      if (updateMapping && Object.keys(updateMapping).length > 0) {
        // Get headers to find column positions - use usedRange to ensure we get data
        const usedRangeResponse = await fetch(
          `${baseUrl}/worksheets('${worksheetName}')/usedRange`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        )

        if (!usedRangeResponse.ok) {
          throw new Error('Failed to fetch worksheet data')
        }

        const usedRangeData = await usedRangeResponse.json()
        const allRows = usedRangeData.values || []
        const headers = allRows[0] || []

        // Prepare updates for each column
        console.log('📊 [Excel Update Row] Processing updateMapping:', updateMapping);
        console.log('📊 [Excel Update Row] Headers found:', headers);

        for (const [column, value] of Object.entries(updateMapping)) {
          const columnIndex = headers.findIndex((h: string) => h === column)

          if (columnIndex === -1) {
            console.warn(`❌ Column "${column}" not found in headers, skipping`)
            continue
          }

          // Convert column index to letter (0 -> A, 1 -> B, etc.)
          const columnLetter = String.fromCharCode(65 + columnIndex)
          const cellAddress = `${worksheetName}!${columnLetter}${row}`

          console.log(`📊 [Excel Update Row] Updating cell ${cellAddress} with value:`, value);

          // Update the cell
          const updateResponse = await fetch(
            `${baseUrl}/worksheets('${worksheetName}')/range(address='${cellAddress}')`,
            {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                values: [[value]]
              })
            }
          )

          if (!updateResponse.ok) {
            const error = await updateResponse.text()
            console.error(`❌ Failed to update cell ${cellAddress}:`, error)
          } else {
            console.log(`✅ Successfully updated cell ${cellAddress}`);
            updatedRanges.push(cellAddress)
          }
        }
      }
    }

    return {
      success: true,
      output: {
        workbookId,
        worksheetName,
        rowsUpdated: rowsToUpdate.length,
        rowNumbers: rowsToUpdate,
        ranges: updatedRanges,
        timestamp: new Date().toISOString()
      },
      message: `Successfully updated ${rowsToUpdate.length} row(s) in ${worksheetName}`
    }

  } catch (error: any) {
    console.error('❌ [Microsoft Excel Update Row] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to update row in Excel'
    }
  }
}