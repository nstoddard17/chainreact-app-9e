import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

import { logger } from '@/lib/utils/logger'

/**
 * Deletes row(s) from a Microsoft Excel worksheet using the Microsoft Graph API
 */
export async function deleteMicrosoftExcelRow(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration with workflow variables
    const resolvedConfig = resolveValue(config, input)

    logger.debug('🗑️ [Excel Delete] Resolved config:', JSON.stringify(resolvedConfig, null, 2))

    const {
      workbookId,
      worksheetName,
      deleteBy,
      rowNumber,
      startRow,
      endRow,
      matchColumn,
      matchValue,
      deleteAll = false,
      confirmDelete = false
    } = resolvedConfig

    logger.debug('🗑️ [Excel Delete] Extracted values:', {
      deleteBy,
      rowNumber,
      startRow,
      endRow,
      matchColumn,
      matchValue,
      deleteAll,
      confirmDelete
    })

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
    if (!confirmDelete) {
      throw new Error('Delete confirmation is required for safety')
    }

    // Microsoft Graph API base URL
    const baseUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${workbookId}/workbook`

    let rowsToDelete: number[] = []
    let deletedCount = 0

    // Handle different delete scenarios
    if (deleteBy === 'row_number' && rowNumber) {
      rowsToDelete = [rowNumber]
    } else if (deleteBy === 'range' && startRow && endRow) {
      // Create array of row numbers in range
      for (let i = startRow; i <= endRow; i++) {
        rowsToDelete.push(i)
      }
    } else if (deleteBy === 'column_value' && matchColumn && matchValue !== undefined) {
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
          rowsToDelete.push(i + 1) // Excel rows are 1-indexed
          if (!deleteAll) {
            break // Only delete first match if not deleting all
          }
        }
      }

      if (rowsToDelete.length === 0) {
        throw new Error(`No rows found matching "${matchValue}" in column "${matchColumn}"`)
      }
    } else {
      throw new Error('Invalid delete configuration')
    }

    // Sort rows in descending order to delete from bottom to top
    // This prevents row number shifting issues
    rowsToDelete.sort((a, b) => b - a)

    // Delete rows one by one (from bottom to top)
    for (const row of rowsToDelete) {
      const deleteUrl = `${baseUrl}/worksheets('${worksheetName}')/range(address='${row}:${row}')/delete`

      const deleteResponse = await fetch(deleteUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          shift: 'Up'
        })
      })

      if (deleteResponse.ok) {
        deletedCount++
      } else {
        const error = await deleteResponse.text()
        logger.error(`Failed to delete row ${row}:`, error)
      }
    }

    // Determine the range that was affected
    let rangeDescription = ''
    if (deleteBy === 'row_number') {
      rangeDescription = `Row ${rowNumber}`
    } else if (deleteBy === 'range') {
      rangeDescription = `Rows ${startRow}-${endRow}`
    } else if (deleteBy === 'column_value') {
      rangeDescription = `${deletedCount} row(s) matching "${matchValue}" in column "${matchColumn}"`
    }

    return {
      success: true,
      output: {
        workbookId,
        worksheetName,
        rowsDeleted: deletedCount,
        range: rangeDescription,
        timestamp: new Date().toISOString()
      },
      message: `Successfully deleted ${deletedCount} row(s) from ${worksheetName}`
    }

  } catch (error: any) {
    logger.error('❌ [Microsoft Excel Delete Row] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to delete row(s) in Excel'
    }
  }
}