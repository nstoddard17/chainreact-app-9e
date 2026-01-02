import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

import { logger } from '@/lib/utils/logger'

/**
 * Updates a row in a Microsoft Excel worksheet using the Microsoft Graph API
 */
export async function updateMicrosoftExcelRow(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    logger.debug('📊 [Excel Update Row] Starting with config:', config);

    // Resolve configuration with workflow variables
    const resolvedConfig = resolveValue(config, input)
    let {
      workbookId,
      worksheetName,
      rowNumber,
      matchColumn,
      matchValue,
      updateMapping,
      updateMultiple = false
    } = resolvedConfig

    // Extract column_* fields from config and build updateMapping
    // The UI sends fields like: column_Column1: "value1", column_Column2: "value2"
    // We need to convert to: { "Column1": "value1", "Column2": "value2" }
    if (!updateMapping || (typeof updateMapping === 'object' && Object.keys(updateMapping).length === 0)) {
      updateMapping = {};
      for (const [key, value] of Object.entries(resolvedConfig)) {
        if (key.startsWith('column_') && value !== undefined && value !== '') {
          const columnName = key.replace('column_', '');
          updateMapping[columnName] = value;
        }
      }
      logger.debug('📊 [Excel Update Row] Extracted column fields:', updateMapping);
    }

    // Transform updateMapping from array format to object format if needed
    // The UI component (MicrosoftExcelColumnMapper) outputs: [{ column: "Name", value: "John" }]
    // But we need: { "Name": "John" }
    if (Array.isArray(updateMapping)) {
      logger.debug('📊 [Excel Update Row] Converting array format to object format');
      const mappingObject: Record<string, any> = {};
      for (const item of updateMapping) {
        if (item && item.column && item.value !== undefined) {
          mappingObject[item.column] = item.value;
        }
      }
      updateMapping = mappingObject;
    }

    logger.debug('📊 [Excel Update Row] Resolved config:', {
      workbookId,
      worksheetName,
      rowNumber,
      updateMapping,
      updateMappingKeys: updateMapping ? Object.keys(updateMapping) : 'undefined'
    });

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
      // Encode worksheet name for URL safety (handles spaces and special chars)
      const encodedWorksheetName = encodeURIComponent(worksheetName)
      const dataResponse = await fetch(
        `${baseUrl}/worksheets('${encodedWorksheetName}')/usedRange`,
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
    // Encode worksheet name once for URL safety (handles spaces and special chars)
    const encodedWorksheetNameForUpdate = encodeURIComponent(worksheetName)
    for (const row of rowsToUpdate) {
      if (updateMapping && Object.keys(updateMapping).length > 0) {
        // Get headers to find column positions - use usedRange to ensure we get data
        const usedRangeResponse = await fetch(
          `${baseUrl}/worksheets('${encodedWorksheetNameForUpdate}')/usedRange`,
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
        logger.debug('📊 [Excel Update Row] Processing updateMapping:', updateMapping);
        logger.debug('📊 [Excel Update Row] Headers found:', headers);

        for (const [column, value] of Object.entries(updateMapping)) {
          const columnIndex = headers.findIndex((h: string) => h === column)

          if (columnIndex === -1) {
            logger.warn(`❌ Column "${column}" not found in headers, skipping`)
            continue
          }

          // Convert column index to letter (0 -> A, 1 -> B, etc.)
          const columnLetter = String.fromCharCode(65 + columnIndex)
          // Cell address is just the cell reference (e.g., A3) since we're already specifying the worksheet in the path
          const cellRef = `${columnLetter}${row}`
          const cellAddress = `${worksheetName}!${cellRef}` // For logging purposes

          logger.debug(`📊 [Excel Update Row] Updating cell ${cellAddress} with value:`, value);

          // Update the cell
          const updateResponse = await fetch(
            `${baseUrl}/worksheets('${encodedWorksheetNameForUpdate}')/range(address='${cellRef}')`,
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
            logger.error(`❌ Failed to update cell ${cellAddress}:`, error)
          } else {
            logger.debug(`✅ Successfully updated cell ${cellAddress}`);
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
    logger.error('❌ [Microsoft Excel Update Row] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to update row in Excel'
    }
  }
}