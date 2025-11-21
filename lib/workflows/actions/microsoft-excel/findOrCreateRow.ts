/**
 * Find or Create Row in Excel Action
 * Searches for a row by column value, updates it if found, creates it if not found
 * This is a common automation pattern from Zapier
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/security/encryption'
import { logger } from '@/lib/utils/logger'
import { resolveValue } from '@/lib/workflows/actions/core'

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0'

interface FindOrCreateRowConfig {
  workbookId: string
  worksheetName: string
  searchColumn: string
  searchValue: any
  columnMapping: Record<string, any>
  updateIfFound?: boolean
}

interface FindOrCreateRowOutput {
  found: boolean
  created: boolean
  updated: boolean
  rowNumber: number
  rowData: Record<string, any>
  action: 'found' | 'created' | 'updated'
  workbookId: string
  worksheetName: string
  timestamp: string
}

/**
 * Find a row or create it if it doesn't exist
 */
export async function findOrCreateMicrosoftExcelRow(
  config: FindOrCreateRowConfig,
  userId: string,
  input: Record<string, any>
): Promise<{ success: boolean; output: FindOrCreateRowOutput; message: string }> {
  const { workbookId, worksheetName, searchColumn, searchValue, columnMapping, updateIfFound = true } = config

  logger.debug('[Microsoft Excel] Find or Create Row:', {
    workbookId,
    worksheetName,
    searchColumn,
    searchValue,
    updateIfFound
  })

  // Get OneDrive integration
  const supabase = createAdminClient()
  const { data: integration, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'onedrive')
    .eq('status', 'connected')
    .single()

  if (error || !integration) {
    throw new Error('OneDrive integration not found or not connected')
  }

  // Decrypt access token
  const accessToken = await decrypt(integration.access_token)

  try {
    // Step 1: Get the worksheet headers to find column indices
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

    // Find the search column index
    const searchColumnIndex = headers.findIndex((h: string) => h === searchColumn)
    if (searchColumnIndex === -1) {
      throw new Error(`Column "${searchColumn}" not found in worksheet`)
    }

    // Step 2: Get all data to search for the value
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
    const allRows = usedRangeData.values || []

    // Step 3: Search for the row
    const resolvedSearchValue = resolveValue(searchValue, input)
    let foundRowIndex = -1

    for (let i = 1; i < allRows.length; i++) { // Start at 1 to skip headers
      const cellValue = allRows[i][searchColumnIndex]
      if (cellValue === resolvedSearchValue || String(cellValue) === String(resolvedSearchValue)) {
        foundRowIndex = i
        break
      }
    }

    // Step 4: Either update existing row or create new one
    if (foundRowIndex !== -1) {
      // Row found
      const actualRowNumber = foundRowIndex + 1 // Excel is 1-indexed

      if (updateIfFound) {
        // Update the existing row
        const rowValues = headers.map((header: string) => {
          const mappedValue = columnMapping[header]
          return mappedValue !== undefined ? resolveValue(mappedValue, input) : allRows[foundRowIndex][headers.indexOf(header)]
        })

        const updateUrl = `${GRAPH_API_BASE}/me/drive/items/${workbookId}/workbook/worksheets('${worksheetName}')/range(address='${actualRowNumber}:${actualRowNumber}')`

        const updateResponse = await fetch(updateUrl, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: [rowValues]
          })
        })

        if (!updateResponse.ok) {
          throw new Error(`Failed to update row: ${await updateResponse.text()}`)
        }

        const rowData: Record<string, any> = {}
        headers.forEach((header: string, index: number) => {
          rowData[header] = rowValues[index]
        })

        logger.debug('[Microsoft Excel] Row found and updated')

        return {
          success: true,
          output: {
            found: true,
            created: false,
            updated: true,
            rowNumber: actualRowNumber,
            rowData,
            action: 'updated',
            workbookId,
            worksheetName,
            timestamp: new Date().toISOString()
          },
          message: `Row found at position ${actualRowNumber} and updated`
        }
      } else {
        // Just return the found row without updating
        const rowData: Record<string, any> = {}
        headers.forEach((header: string, index: number) => {
          rowData[header] = allRows[foundRowIndex][index]
        })

        logger.debug('[Microsoft Excel] Row found (not updated)')

        return {
          success: true,
          output: {
            found: true,
            created: false,
            updated: false,
            rowNumber: actualRowNumber,
            rowData,
            action: 'found',
            workbookId,
            worksheetName,
            timestamp: new Date().toISOString()
          },
          message: `Row found at position ${actualRowNumber}`
        }
      }
    } else {
      // Row not found - create it
      const rowValues = headers.map((header: string) => {
        const mappedValue = columnMapping[header]
        return mappedValue !== undefined ? resolveValue(mappedValue, input) : ''
      })

      const addRowUrl = `${GRAPH_API_BASE}/me/drive/items/${workbookId}/workbook/worksheets('${worksheetName}')/range(address='A1')/insert`

      const addRowResponse = await fetch(addRowUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          shift: 'Down',
          values: [rowValues]
        })
      })

      if (!addRowResponse.ok) {
        // If insert fails, try appending at the end
        const appendUrl = `${GRAPH_API_BASE}/me/drive/items/${workbookId}/workbook/worksheets('${worksheetName}')/range(address='A${allRows.length + 1}')`

        const appendResponse = await fetch(appendUrl, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: [rowValues]
          })
        })

        if (!appendResponse.ok) {
          throw new Error(`Failed to create row: ${await appendResponse.text()}`)
        }
      }

      const rowData: Record<string, any> = {}
      headers.forEach((header: string, index: number) => {
        rowData[header] = rowValues[index]
      })

      const newRowNumber = allRows.length + 1

      logger.debug('[Microsoft Excel] Row created')

      return {
        success: true,
        output: {
          found: false,
          created: true,
          updated: false,
          rowNumber: newRowNumber,
          rowData,
          action: 'created',
          workbookId,
          worksheetName,
          timestamp: new Date().toISOString()
        },
        message: `Row not found - created new row at position ${newRowNumber}`
      }
    }

  } catch (error: any) {
    logger.error('[Microsoft Excel] Error in find or create row:', error)
    throw new Error(`Failed to find or create row: ${error.message}`)
  }
}
