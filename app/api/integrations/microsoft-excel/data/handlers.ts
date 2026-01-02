/**
 * Microsoft Excel data handlers for dropdown population
 * Uses Microsoft Graph API to fetch Excel data
 */

import { decrypt } from '@/lib/security/encryption'
import { logger } from '@/lib/utils/logger'
import {
  ExcelDataHandler,
  ExcelHandlers,
  MicrosoftExcelIntegration,
  ExcelHandlerOptions,
  ExcelWorksheet
} from './types'

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0'
const DEFAULT_TIMEOUT = 15000 // 15 seconds for Graph API calls

/**
 * Fetch with timeout for Graph API calls
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = DEFAULT_TIMEOUT): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Get decrypted access token
 */
async function getAccessToken(integration: MicrosoftExcelIntegration): Promise<string> {
  if (!integration.access_token) {
    throw new Error('No access token found for OneDrive integration')
  }

  try {
    return await decrypt(integration.access_token)
  } catch (error) {
    throw new Error('Failed to decrypt OneDrive access token')
  }
}

/**
 * Fetch workbooks from OneDrive
 * Uses multiple strategies for reliability:
 * 1. First tries listing root folder and common locations
 * 2. Falls back to search API if direct listing finds nothing
 */
const fetchWorkbooks: ExcelDataHandler = async (integration: MicrosoftExcelIntegration, options: ExcelHandlerOptions) => {
  const accessToken = await getAccessToken(integration)
  const allWorkbooks: Map<string, any> = new Map()

  try {
    // Strategy 1: List root folder and common folders in PARALLEL for speed

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }

    // Define all folder paths to check
    const folderPaths = [
      '', // root
      'Documents',
      'Excel',
      'Spreadsheets',
      'Work',
      'Shared'
    ]

    // Build all fetch promises
    const fetchPromises = folderPaths.map(async (folderPath) => {
      try {
        const url = folderPath
          ? `${GRAPH_API_BASE}/me/drive/root:/${folderPath}:/children?$filter=file ne null&$select=id,name,webUrl,createdDateTime,lastModifiedDateTime,file&$top=100`
          : `${GRAPH_API_BASE}/me/drive/root/children?$filter=file ne null&$select=id,name,webUrl,createdDateTime,lastModifiedDateTime,file&$top=200`

        const response = await fetchWithTimeout(url, { headers }, 10000)

        if (response.ok) {
          const data = await response.json()
          return { folderPath: folderPath || 'root', files: data.value || [] }
        }
        return { folderPath: folderPath || 'root', files: [] }
      } catch (error) {
        // Folder doesn't exist or request failed, return empty
        return { folderPath: folderPath || 'root', files: [] }
      }
    })

    // Execute all requests in parallel
    const results = await Promise.all(fetchPromises)

    // Collect all Excel files from all folders
    for (const result of results) {
      for (const file of result.files) {
        if (file.name?.toLowerCase().endsWith('.xlsx') || file.name?.toLowerCase().endsWith('.xls')) {
          allWorkbooks.set(file.id, file)
        }
      }
    }

    // Strategy 2: Use search API as fallback if we found nothing
    if (allWorkbooks.size === 0) {
      try {
        const searchUrl = `${GRAPH_API_BASE}/me/drive/search(q='.xlsx')?$select=id,name,webUrl,createdDateTime,lastModifiedDateTime&$top=100`
        const searchResponse = await fetchWithTimeout(searchUrl, { headers }, 15000)

        if (searchResponse.ok) {
          const searchData = await searchResponse.json()
          const searchFiles = searchData.value || []

          for (const file of searchFiles) {
            if (file.name?.toLowerCase().endsWith('.xlsx') || file.name?.toLowerCase().endsWith('.xls')) {
              allWorkbooks.set(file.id, file)
            }
          }
        }
      } catch (searchError) {
        // Search API failed, continue to next strategy
      }
    }

    // Strategy 3: List all recent files if still nothing
    if (allWorkbooks.size === 0) {
      try {
        const recentUrl = `${GRAPH_API_BASE}/me/drive/recent?$select=id,name,webUrl,createdDateTime,lastModifiedDateTime,file&$top=100`
        const recentResponse = await fetchWithTimeout(recentUrl, { headers }, 10000)

        if (recentResponse.ok) {
          const recentData = await recentResponse.json()
          const recentFiles = recentData.value || []

          for (const file of recentFiles) {
            if (file.name?.toLowerCase().endsWith('.xlsx') || file.name?.toLowerCase().endsWith('.xls')) {
              allWorkbooks.set(file.id, file)
            }
          }
        }
      } catch (recentError) {
        // Recent files failed, continue
      }
    }

    // Convert Map to array and format for dropdown
    const workbooks = Array.from(allWorkbooks.values())

    if (workbooks.length === 0) {
      return []
    }

    // Format for dropdown, sort by last modified
    return workbooks
      .sort((a, b) => new Date(b.lastModifiedDateTime || 0).getTime() - new Date(a.lastModifiedDateTime || 0).getTime())
      .map((workbook: any) => ({
        value: workbook.id,
        label: workbook.name.replace(/\.(xlsx|xls)$/i, ''),
        description: workbook.lastModifiedDateTime
          ? `Last modified: ${new Date(workbook.lastModifiedDateTime).toLocaleDateString()}`
          : undefined
      }))

  } catch (error) {
    throw error
  }
}

/**
 * Fetch worksheets from a workbook
 */
const fetchWorksheets: ExcelDataHandler = async (integration: MicrosoftExcelIntegration, options: ExcelHandlerOptions) => {
  const { workbookId } = options

  if (!workbookId) {
    throw new Error('Workbook ID is required to fetch worksheets')
  }

  const accessToken = await getAccessToken(integration)

  try {
    const url = `${GRAPH_API_BASE}/me/drive/items/${workbookId}/workbook/worksheets`

    const response = await fetchWithTimeout(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to fetch worksheets: ${error}`)
    }

    const data = await response.json()
    const worksheets = data.value || []

    // Format for dropdown
    return worksheets.map((sheet: ExcelWorksheet) => ({
      value: sheet.name,
      label: sheet.name
    }))

  } catch (error: any) {
    logger.error('[Microsoft Excel] Error fetching worksheets', {
      error: error.message,
      workbookId: options.workbookId
    });
    throw error
  }
}

/**
 * Fetch columns from a worksheet
 * Supports two modes:
 * 1. hasHeaders=true (default): Uses row 1 values as column names
 * 2. hasHeaders=false: Returns column letters (A, B, C, etc.) based on used range or defaults to 10 columns
 */
const fetchColumns: ExcelDataHandler = async (integration: MicrosoftExcelIntegration, options: ExcelHandlerOptions) => {
  const { workbookId, worksheetName, hasHeaders = true } = options

  if (!workbookId || !worksheetName) {
    logger.error('[fetchColumns] Missing required parameters', {
      hasWorkbookId: !!workbookId,
      hasWorksheetName: !!worksheetName
    });
    throw new Error('Workbook ID and worksheet name are required to fetch columns')
  }

  const accessToken = await getAccessToken(integration)

  // URL encode the worksheet name for API calls (handles spaces and special chars)
  const encodedWorksheetName = encodeURIComponent(worksheetName)

  try {
    // Use usedRange to get the actual data range with values
    const usedRangeUrl = `${GRAPH_API_BASE}/me/drive/items/${workbookId}/workbook/worksheets('${encodedWorksheetName}')/usedRange`

    const usedRangeResponse = await fetchWithTimeout(usedRangeUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    // Handle case where worksheet is empty or usedRange fails
    if (!usedRangeResponse.ok) {
      const errorText = await usedRangeResponse.text()
      logger.debug('[fetchColumns] usedRange returned error, worksheet may be empty', { errorText });

      // For empty worksheets, return default column letters (A through J)
      const defaultColumnCount = 10
      return Array.from({ length: defaultColumnCount }, (_, index) => {
        const letter = String.fromCharCode(65 + index)
        return {
          value: letter,
          label: `Column ${letter}`,
          description: `Column ${letter}`
        }
      })
    }

    const usedRangeData = await usedRangeResponse.json()
    const allRows = usedRangeData.values || []

    // If worksheet is empty, return default column letters
    if (allRows.length === 0 || (allRows.length === 1 && allRows[0].every((v: any) => !v))) {
      const defaultColumnCount = 10
      return Array.from({ length: defaultColumnCount }, (_, index) => {
        const letter = String.fromCharCode(65 + index)
        return {
          value: letter,
          label: `Column ${letter}`,
          description: `Column ${letter}`
        }
      })
    }

    // Determine column count from the data
    const columnCount = Math.max(...allRows.map((row: any[]) => row.length))

    logger.debug('[fetchColumns] Processing columns', {
      hasHeaders,
      hasHeadersType: typeof hasHeaders,
      columnCount,
      useColumnLetters: hasHeaders === false || hasHeaders === 'no'
    })

    // If hasHeaders is false or 'no', return column letters based on actual data width
    if (hasHeaders === false || hasHeaders === 'no') {
      const columns = Array.from({ length: columnCount }, (_, index) => {
        const letter = String.fromCharCode(65 + index)
        return {
          value: letter,
          label: `Column ${letter}`,
          description: `Column ${letter}`
        }
      })
      logger.debug('[fetchColumns] Returning column letters', { columns: columns.map(c => c.value) })
      return columns
    }

    // hasHeaders is true - use row 1 as headers
    const headers = allRows[0] || []

    // Format for dropdown - filter out empty cells but preserve column positions
    const result = headers
      .map((header: any, index: number) => {
        const headerStr = header ? header.toString().trim() : ''
        const columnLetter = String.fromCharCode(65 + index)

        // If header is empty, use the column letter instead
        if (!headerStr) {
          return {
            value: columnLetter,
            label: `Column ${columnLetter} (empty header)`,
            description: `Column ${columnLetter}`
          }
        }

        return {
          value: headerStr,
          label: headerStr,
          description: `Column ${columnLetter}`
        }
      })

    return result

  } catch (error: any) {
    logger.error('[Microsoft Excel] Error fetching columns', {
      error: error.message,
      workbookId,
      worksheetName,
      hasHeaders
    });

    // On error, return default column letters so the UI doesn't break
    const defaultColumnCount = 10
    return Array.from({ length: defaultColumnCount }, (_, index) => {
      const letter = String.fromCharCode(65 + index)
      return {
        value: letter,
        label: `Column ${letter}`,
        description: `Column ${letter}`
      }
    })
  }
}

/**
 * Fetch column values from a worksheet
 */
const fetchColumnValues: ExcelDataHandler = async (integration: MicrosoftExcelIntegration, options: ExcelHandlerOptions) => {
  const { workbookId, worksheetName, columnName } = options

  if (!workbookId || !worksheetName || !columnName) {
    throw new Error('Workbook ID, worksheet name, and column name are required')
  }

  const accessToken = await getAccessToken(integration)

  try {
    // First get the headers to find column index
    const headersUrl = `${GRAPH_API_BASE}/me/drive/items/${workbookId}/workbook/worksheets('${encodeURIComponent(worksheetName)}')/range(address='1:1')`

    const headersResponse = await fetchWithTimeout(headersUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!headersResponse.ok) {
      throw new Error('Failed to fetch headers')
    }

    const headersData = await headersResponse.json()
    const headers = headersData.values?.[0] || []
    const columnIndex = headers.findIndex((h: string) => h === columnName)

    if (columnIndex === -1) {
      throw new Error(`Column "${columnName}" not found`)
    }

    // Convert column index to letter
    const columnLetter = String.fromCharCode(65 + columnIndex)

    // Get all values from that column (limit to first 100 rows for performance)
    const valuesUrl = `${GRAPH_API_BASE}/me/drive/items/${workbookId}/workbook/worksheets('${encodeURIComponent(worksheetName)}')/range(address='${columnLetter}2:${columnLetter}100')`

    const valuesResponse = await fetchWithTimeout(valuesUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!valuesResponse.ok) {
      throw new Error('Failed to fetch column values')
    }

    const valuesData = await valuesResponse.json()
    const values = valuesData.values || []

    // Get unique values and format for dropdown
    const uniqueValues = [...new Set(values
      .flat()
      .filter((v: any) => v !== null && v !== undefined && v.toString().trim() !== '')
      .map((v: any) => v.toString())
    )]

    return uniqueValues.map(value => ({
      value,
      label: value
    }))

  } catch (error) {
    throw error
  }
}

/**
 * Fetch folders from OneDrive for saving workbooks
 */
const fetchFolders: ExcelDataHandler = async (integration: MicrosoftExcelIntegration, options: ExcelHandlerOptions) => {
  const accessToken = await getAccessToken(integration)

  try {
    // Get root folder and its children
    const url = `${GRAPH_API_BASE}/me/drive/root/children?$filter=folder ne null&$select=id,name,folder`

    const response = await fetchWithTimeout(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to fetch folders: ${error}`)
    }

    const data = await response.json()
    const folders = data.value || []

    // Add root folder option
    const folderOptions = [
      { value: '', label: 'Root (My files)' },
      ...folders.map((folder: any) => ({
        value: folder.name,
        label: folder.name
      }))
    ]

    return folderOptions

  } catch (error) {
    throw error
  }
}

/**
 * Preview worksheet data
 */
const fetchDataPreview: ExcelDataHandler = async (integration: MicrosoftExcelIntegration, options: ExcelHandlerOptions) => {
  const { workbookId, worksheetName, hasHeaders = true } = options

  if (!workbookId || !worksheetName) {
    throw new Error('Workbook ID and worksheet name are required')
  }

  const accessToken = await getAccessToken(integration)

  try {
    // First get the used range to know actual data extent
    const usedRangeUrl = `${GRAPH_API_BASE}/me/drive/items/${workbookId}/workbook/worksheets('${encodeURIComponent(worksheetName)}')/usedRange`

    const usedRangeResponse = await fetchWithTimeout(usedRangeUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!usedRangeResponse.ok) {
      const error = await usedRangeResponse.text()
      throw new Error(`Failed to fetch used range: ${error}`)
    }

    const usedRangeData = await usedRangeResponse.json()
    const rawValues = usedRangeData.values || []

    if (rawValues.length === 0) {
      return []
    }

    // Limit to 100 rows max for performance
    const limitedValues = rawValues.slice(0, Math.min(rawValues.length, 100))

    // Format the data based on whether headers exist
    if (hasHeaders && limitedValues.length > 0) {
      const headers = limitedValues[0]
      const dataRows = limitedValues.slice(1)

      return dataRows.map((row: any, index: number) => {
        const fields: Record<string, any> = {}
        headers.forEach((header: string, colIndex: number) => {
          if (header) {
            fields[header] = row[colIndex] || ''
          }
        })

        return {
          id: `row_${index + 2}`, // Row 2 is first data row (1 is headers)
          rowNumber: index + 2,
          fields
        }
      }).filter((row: any) => Object.keys(row.fields).length > 0) // Filter out empty rows
    }
      // No headers - use column letters as field names
      return limitedValues.map((row: any, index: number) => {
        const fields: Record<string, any> = {}
        row.forEach((value: any, colIndex: number) => {
          const columnLetter = String.fromCharCode(65 + colIndex) // A, B, C, etc.
          fields[columnLetter] = value || ''
        })

        return {
          id: `row_${index + 1}`,
          rowNumber: index + 1,
          fields
        }
      }).filter((row: any) => Object.keys(row.fields).length > 0)


  } catch (error) {
    throw error
  }
}

/**
 * Fetch tables from a workbook
 */
const fetchTables: ExcelDataHandler = async (integration: MicrosoftExcelIntegration, options: ExcelHandlerOptions) => {
  const { workbookId } = options

  if (!workbookId) {
    throw new Error('Workbook ID is required to fetch tables')
  }

  const accessToken = await getAccessToken(integration)

  try {
    const url = `${GRAPH_API_BASE}/me/drive/items/${workbookId}/workbook/tables`

    const response = await fetchWithTimeout(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to fetch tables: ${error}`)
    }

    const data = await response.json()
    const tables = data.value || []

    // Fetch row count for each table in parallel
    const tablesWithRowCount = await Promise.all(
      tables.map(async (table: any) => {
        try {
          // Get actual row count by fetching the table rows (excluding header row)
          const rowsUrl = `${GRAPH_API_BASE}/me/drive/items/${workbookId}/workbook/tables/${encodeURIComponent(table.name || table.id)}/rows/$count`

          const rowsResponse = await fetchWithTimeout(rowsUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }, 5000) // Shorter timeout for count queries

          let rowCount = 0
          if (rowsResponse.ok) {
            const countText = await rowsResponse.text()
            rowCount = parseInt(countText, 10) || 0
          }

          return {
            value: table.name || table.id,
            label: table.name || `Table ${table.id}`,
            description: `${rowCount} row${rowCount !== 1 ? 's' : ''}`
          }
        } catch (error) {
          // If fetching row count fails, fall back to the table's rowCount property
          return {
            value: table.name || table.id,
            label: table.name || `Table ${table.id}`,
            description: `${table.rowCount || 0} row${table.rowCount !== 1 ? 's' : ''}`
          }
        }
      })
    )

    return tablesWithRowCount

  } catch (error) {
    throw error
  }
}

/**
 * Fetch columns from a table
 */
const fetchTableColumns: ExcelDataHandler = async (integration: MicrosoftExcelIntegration, options: ExcelHandlerOptions) => {
  const { workbookId, tableName } = options

  if (!workbookId || !tableName) {
    throw new Error('Workbook ID and table name are required to fetch table columns')
  }

  const accessToken = await getAccessToken(integration)

  try {
    const url = `${GRAPH_API_BASE}/me/drive/items/${workbookId}/workbook/tables/${encodeURIComponent(tableName)}/columns`

    const response = await fetchWithTimeout(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to fetch table columns: ${error}`)
    }

    const data = await response.json()
    const columns = data.value || []

    // Format for dropdown
    return columns.map((column: any, index: number) => ({
      value: column.name,
      label: column.name,
      description: `Column ${index + 1}`
    }))

  } catch (error) {
    throw error
  }
}

/**
 * Registry of all Microsoft Excel data handlers
 */
export const microsoftExcelHandlers: ExcelHandlers = {
  'workbooks': fetchWorkbooks,
  'worksheets': fetchWorksheets,
  'columns': fetchColumns,
  'column_values': fetchColumnValues,
  'folders': fetchFolders,
  'data_preview': fetchDataPreview,
  'tables': fetchTables,
  'table_columns': fetchTableColumns,
}