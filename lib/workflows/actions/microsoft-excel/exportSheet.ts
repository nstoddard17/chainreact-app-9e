import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

import { logger } from '@/lib/utils/logger'

/**
 * Exports data from a Microsoft Excel worksheet with filtering and formatting options
 */
export async function exportMicrosoftExcelSheet(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration with workflow variables
    const resolvedConfig = resolveValue(config, { input })
    const {
      workbookId,
      worksheetName,
      keywordSearch,
      filterColumn,
      filterOperator = 'equals',
      filterValue,
      sortColumn,
      sortOrder = 'asc',
      recordLimit,
      maxRows,
      includeHeaders = true,
      outputFormat = 'objects',
      range: customRange
    } = resolvedConfig

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

    // Microsoft Graph API base URL
    const baseUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${workbookId}/workbook`

    // Fetch the data from the worksheet
    let dataUrl = `${baseUrl}/worksheets('${worksheetName}')/`

    // Use custom range if provided, otherwise get all used range
    if (customRange) {
      dataUrl += `range(address='${customRange}')`
    } else {
      dataUrl += 'usedRange'
    }

    const dataResponse = await fetch(dataUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!dataResponse.ok) {
      const error = await dataResponse.text()
      throw new Error(`Failed to fetch worksheet data: ${error}`)
    }

    const data = await dataResponse.json()
    const values = data.values || []

    if (values.length === 0) {
      return {
        success: true,
        output: {
          rows: [],
          rowCount: 0,
          totalRows: 0,
          headers: [],
          range: data.address || ''
        },
        message: 'No data found in worksheet'
      }
    }

    // Extract headers (first row)
    const headers = values[0] || []
    let dataRows = values.slice(1) // Skip header row for processing

    // Apply keyword search across all columns
    if (keywordSearch) {
      const searchLower = keywordSearch.toLowerCase()
      dataRows = dataRows.filter((row: any[]) =>
        row.some((cell: any) =>
          cell && cell.toString().toLowerCase().includes(searchLower)
        )
      )
    }

    // Apply column filter
    if (filterColumn && filterValue !== undefined) {
      const columnIndex = headers.findIndex((h: string) => h === filterColumn)

      if (columnIndex !== -1) {
        dataRows = dataRows.filter((row: any[]) => {
          const cellValue = row[columnIndex]
          const cellStr = cellValue?.toString() || ''
          const filterStr = filterValue?.toString() || ''

          switch (filterOperator) {
            case 'equals':
              return cellStr === filterStr
            case 'not_equals':
              return cellStr !== filterStr
            case 'contains':
              return cellStr.includes(filterStr)
            case 'not_contains':
              return !cellStr.includes(filterStr)
            case 'starts_with':
              return cellStr.startsWith(filterStr)
            case 'ends_with':
              return cellStr.endsWith(filterStr)
            case 'greater_than':
              return parseFloat(cellStr) > parseFloat(filterStr)
            case 'less_than':
              return parseFloat(cellStr) < parseFloat(filterStr)
            case 'greater_equal':
              return parseFloat(cellStr) >= parseFloat(filterStr)
            case 'less_equal':
              return parseFloat(cellStr) <= parseFloat(filterStr)
            case 'is_empty':
              return !cellStr
            case 'is_not_empty':
              return !!cellStr
            default:
              return true
          }
        })
      }
    }

    // Apply sorting
    if (sortColumn) {
      const columnIndex = headers.findIndex((h: string) => h === sortColumn)

      if (columnIndex !== -1) {
        dataRows.sort((a: any[], b: any[]) => {
          const aVal = a[columnIndex]?.toString() || ''
          const bVal = b[columnIndex]?.toString() || ''

          // Try to sort as numbers first
          const aNum = parseFloat(aVal)
          const bNum = parseFloat(bVal)

          if (!isNaN(aNum) && !isNaN(bNum)) {
            return sortOrder === 'asc' ? aNum - bNum : bNum - aNum
          }

          // Fall back to string comparison
          return sortOrder === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal)
        })
      }
    }

    // Apply row limit
    const totalRows = dataRows.length
    if (recordLimit) {
      const limit = recordLimit === 'custom' && maxRows ? maxRows : parseInt(recordLimit)
      if (!isNaN(limit) && limit > 0) {
        dataRows = dataRows.slice(0, limit)
      }
    }

    // Format output based on requested format
    let formattedOutput: any

    switch (outputFormat) {
      case 'objects':
        // Convert to array of objects with column names as keys
        formattedOutput = dataRows.map((row: any[]) => {
          const obj: Record<string, any> = {}
          headers.forEach((header: string, index: number) => {
            obj[header] = row[index] || ''
          })
          return obj
        })
        break

      case 'arrays':
        // Keep as arrays
        formattedOutput = includeHeaders ? [headers, ...dataRows] : dataRows
        break

      case 'csv':
        // Convert to CSV string
        const csvRows = includeHeaders ? [headers, ...dataRows] : dataRows
        formattedOutput = csvRows
          .map((row: any[]) =>
            row.map((cell: any) => {
              const cellStr = (cell || '').toString()
              // Escape quotes and wrap in quotes if contains comma, quote, or newline
              if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                return `"${cellStr.replace(/"/g, '""')}"`
              }
              return cellStr
            }).join(',')
          )
          .join('\n')
        break

      case 'json':
        // Convert to JSON string
        const jsonData = dataRows.map((row: any[]) => {
          const obj: Record<string, any> = {}
          headers.forEach((header: string, index: number) => {
            obj[header] = row[index] || ''
          })
          return obj
        })
        formattedOutput = JSON.stringify(jsonData, null, 2)
        break

      default:
        formattedOutput = dataRows
    }

    return {
      success: true,
      output: {
        rows: formattedOutput,
        rowCount: dataRows.length,
        totalRows: totalRows,
        headers: headers,
        range: data.address || customRange || `${worksheetName}!UsedRange`
      },
      message: `Successfully exported ${dataRows.length} rows from ${worksheetName}`
    }

  } catch (error: any) {
    logger.error('❌ [Microsoft Excel Export Sheet] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to export Excel worksheet'
    }
  }
}