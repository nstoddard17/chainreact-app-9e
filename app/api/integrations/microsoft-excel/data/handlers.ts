/**
 * Microsoft Excel data handlers for dropdown population
 * Uses Microsoft Graph API to fetch Excel data
 */

import { decrypt } from '@/lib/security/encryption'
import {
  ExcelDataHandler,
  ExcelHandlers,
  MicrosoftExcelIntegration,
  ExcelHandlerOptions,
  ExcelWorkbook,
  ExcelWorksheet
} from './types'

import { logger } from '@/lib/utils/logger'

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0'

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
    logger.error('Failed to decrypt access token:', error)
    throw new Error('Failed to decrypt OneDrive access token')
  }
}

/**
 * Fetch workbooks from OneDrive
 */
const fetchWorkbooks: ExcelDataHandler = async (integration: MicrosoftExcelIntegration, options: ExcelHandlerOptions) => {
  const accessToken = await getAccessToken(integration)

  try {
    // Search for Excel files in OneDrive
    const searchUrl = `${GRAPH_API_BASE}/me/drive/search(q='.xlsx')?$select=id,name,webUrl,createdDateTime,lastModifiedDateTime`

    const response = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to fetch workbooks: ${error}`)
    }

    const data = await response.json()
    const workbooks = data.value || []

    // Format for dropdown
    return workbooks.map((workbook: any) => ({
      value: workbook.id,
      label: workbook.name.replace('.xlsx', ''),
      description: `Last modified: ${new Date(workbook.lastModifiedDateTime).toLocaleDateString()}`
    }))

  } catch (error) {
    logger.error('Error fetching workbooks:', error)
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

    const response = await fetch(url, {
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

  } catch (error) {
    logger.error('Error fetching worksheets:', error)
    throw error
  }
}

/**
 * Fetch columns from a worksheet
 */
const fetchColumns: ExcelDataHandler = async (integration: MicrosoftExcelIntegration, options: ExcelHandlerOptions) => {
  const { workbookId, worksheetName } = options

  if (!workbookId || !worksheetName) {
    throw new Error('Workbook ID and worksheet name are required to fetch columns')
  }

  const accessToken = await getAccessToken(integration)

  try {
    // Get the first row (headers) from the worksheet
    const url = `${GRAPH_API_BASE}/me/drive/items/${workbookId}/workbook/worksheets('${worksheetName}')/range(address='1:1')`

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to fetch columns: ${error}`)
    }

    const data = await response.json()
    const headers = data.values?.[0] || []

    // Format for dropdown
    return headers
      .filter((header: any) => header && header.toString().trim() !== '')
      .map((header: string, index: number) => ({
        value: header,
        label: header,
        description: `Column ${String.fromCharCode(65 + index)}`
      }))

  } catch (error) {
    logger.error('Error fetching columns:', error)
    throw error
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
    const headersUrl = `${GRAPH_API_BASE}/me/drive/items/${workbookId}/workbook/worksheets('${worksheetName}')/range(address='1:1')`

    const headersResponse = await fetch(headersUrl, {
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
    const valuesUrl = `${GRAPH_API_BASE}/me/drive/items/${workbookId}/workbook/worksheets('${worksheetName}')/range(address='${columnLetter}2:${columnLetter}100')`

    const valuesResponse = await fetch(valuesUrl, {
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
    logger.error('Error fetching column values:', error)
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

    const response = await fetch(url, {
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
    logger.error('Error fetching folders:', error)
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
    const usedRangeUrl = `${GRAPH_API_BASE}/me/drive/items/${workbookId}/workbook/worksheets('${worksheetName}')/usedRange`

    const usedRangeResponse = await fetch(usedRangeUrl, {
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

      return dataRows.map((row, index) => {
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
      }).filter(row => Object.keys(row.fields).length > 0) // Filter out empty rows
    } 
      // No headers - use column letters as field names
      return limitedValues.map((row, index) => {
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
      }).filter(row => Object.keys(row.fields).length > 0)
    

  } catch (error) {
    logger.error('Error fetching data preview:', error)
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
}