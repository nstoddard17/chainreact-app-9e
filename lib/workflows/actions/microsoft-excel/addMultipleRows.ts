/**
 * Add Multiple Rows to Excel Action
 * Adds multiple rows to a worksheet in batch using Microsoft Graph API
 * Optimized for performance with batch requests
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/security/encryption'
import { logger } from '@/lib/utils/logger'
import { resolveValue } from '@/lib/workflows/actions/core'

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0'

interface AddMultipleRowsConfig {
  workbookId: string
  worksheetName: string
  rows: any[] // Array of row data objects
  columnMapping?: Record<string, any> // Optional column mapping for each row
}

interface AddMultipleRowsOutput {
  rowsAdded: number
  firstRowNumber: number
  lastRowNumber: number
  worksheetName: string
  workbookId: string
  timestamp: string
}

/**
 * Add multiple rows to a worksheet in batch
 */
export async function addMicrosoftExcelMultipleRows(
  config: AddMultipleRowsConfig,
  userId: string,
  input: Record<string, any>
): Promise<{ success: boolean; output: AddMultipleRowsOutput; message: string }> {
  let { workbookId, worksheetName, rows, columnMapping } = config

  // Transform columnMapping from array format to object format if needed
  // The UI component (MicrosoftExcelColumnMapper) outputs: [{ column: "Name", value: "John" }]
  // But we need: { "Name": "John" }
  if (Array.isArray(columnMapping)) {
    logger.debug('[Microsoft Excel] Converting array format to object format');
    const mappingObject: Record<string, any> = {};
    for (const item of columnMapping) {
      if (item && item.column && item.value !== undefined) {
        mappingObject[item.column] = item.value;
      }
    }
    columnMapping = mappingObject;
  }

  logger.debug('[Microsoft Excel] Adding multiple rows:', {
    workbookId,
    worksheetName,
    rowCount: rows?.length || 0
  })

  // Validate rows array
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    throw new Error('Rows array is required and must contain at least one row')
  }

  // Get Microsoft Excel integration
  const supabase = createAdminClient()
  const { data: integration, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'microsoft-excel')
    .eq('status', 'connected')
    .single()

  if (error || !integration) {
    throw new Error('Microsoft Excel integration not found or not connected')
  }

  // Decrypt access token
  const accessToken = await decrypt(integration.access_token)

  try {
    // Step 1: Get the worksheet headers to determine column order
    const headersUrl = `${GRAPH_API_BASE}/me/drive/items/${workbookId}/workbook/worksheets('${worksheetName}')/range(address='1:1')`

    const headersResponse = await fetch(headersUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!headersResponse.ok) {
      throw new Error(`Failed to fetch headers: ${await headersResponse.text()}`)
    }

    const headersData = await headersResponse.json()
    const headers = headersData.values?.[0] || []

    // Step 2: Get current used range to determine where to append
    const usedRangeUrl = `${GRAPH_API_BASE}/me/drive/items/${workbookId}/workbook/worksheets('${worksheetName}')/usedRange`

    const usedRangeResponse = await fetch(usedRangeUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!usedRangeResponse.ok) {
      throw new Error(`Failed to fetch worksheet data: ${await usedRangeResponse.text()}`)
    }

    const usedRangeData = await usedRangeResponse.json()
    const currentRowCount = usedRangeData.rowCount || 1
    const firstNewRowNumber = currentRowCount + 1

    // Step 3: Prepare row values arrays
    const rowValues: any[][] = rows.map((rowData) => {
      return headers.map((header: string) => {
        // Check if columnMapping is provided
        if (columnMapping && columnMapping[header] !== undefined) {
          return resolveValue(columnMapping[header], { ...input, ...rowData })
        }
        // Otherwise use the row data directly
        return rowData[header] !== undefined ? resolveValue(rowData[header], input) : ''
      })
    })

    // Step 4: Calculate the range for the new rows
    const lastColumn = String.fromCharCode(64 + headers.length) // A=65, so headers.length=1 -> A
    const rangeAddress = `A${firstNewRowNumber}:${lastColumn}${firstNewRowNumber + rows.length - 1}`

    // Step 5: Add all rows in a single batch operation
    const addRowsUrl = `${GRAPH_API_BASE}/me/drive/items/${workbookId}/workbook/worksheets('${worksheetName}')/range(address='${rangeAddress}')`

    const addRowsResponse = await fetch(addRowsUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: rowValues
      })
    })

    if (!addRowsResponse.ok) {
      throw new Error(`Failed to add rows: ${await addRowsResponse.text()}`)
    }

    logger.debug('[Microsoft Excel] Successfully added multiple rows')

    return {
      success: true,
      output: {
        rowsAdded: rows.length,
        firstRowNumber: firstNewRowNumber,
        lastRowNumber: firstNewRowNumber + rows.length - 1,
        worksheetName,
        workbookId,
        timestamp: new Date().toISOString()
      },
      message: `Successfully added ${rows.length} rows to ${worksheetName}`
    }

  } catch (error: any) {
    logger.error('[Microsoft Excel] Error adding multiple rows:', error)
    throw new Error(`Failed to add multiple rows: ${error.message}`)
  }
}
