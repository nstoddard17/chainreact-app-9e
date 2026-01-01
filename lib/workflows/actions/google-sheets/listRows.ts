import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

import { logger } from '@/lib/utils/logger'
import { parseSheetName } from './utils'

/**
 * Lists and filters rows from a Google Sheets spreadsheet
 */
export async function listGoogleSheetsRows(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "google-sheets")

    const spreadsheetId = resolveValue(config.spreadsheetId, input)
    const sheetName = parseSheetName(resolveValue(config.sheetName, input))
    const keywordSearch = resolveValue(config.keywordSearch, input)
    const filterColumn = resolveValue(config.filterColumn, input)
    const filterOperator = resolveValue(config.filterOperator, input) || 'equals'
    const filterValue = resolveValue(config.filterValue, input)
    const additionalFilters = config.additionalFilters || []
    const sortColumn = resolveValue(config.sortColumn, input)
    const sortOrder = resolveValue(config.sortOrder, input) || 'asc'
    const dateFilter = resolveValue(config.dateFilter, input)
    const dateColumn = resolveValue(config.dateColumn, input)
    const customDateRange = config.customDateRange
    const recordLimit = resolveValue(config.recordLimit, input)
    const maxRows = resolveValue(config.maxRows, input) || 100
    const includeHeaders = resolveValue(config.includeHeaders, input) !== false
    const outputFormat = resolveValue(config.outputFormat, input) || 'objects'
    const range = resolveValue(config.range, input)
    const formula = resolveValue(config.formula, input)

    logger.debug("Resolved list rows values:", {
      spreadsheetId,
      sheetName,
      keywordSearch,
      filterColumn,
      filterOperator,
      filterValue,
      sortColumn,
      sortOrder,
      dateFilter,
      recordLimit,
      outputFormat
    })

    if (!spreadsheetId || !sheetName) {
      const message = `Missing required fields: ${!spreadsheetId ? "Spreadsheet ID" : ""} ${!sheetName ? "Sheet Name" : ""}`
      logger.error(message)
      return { success: false, message }
    }

    // Fetch sheet data
    const queryRange = range || sheetName
    const dataResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(queryRange)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!dataResponse.ok) {
      throw new Error(`Failed to fetch sheet data: ${dataResponse.status}`)
    }

    const sheetData = await dataResponse.json()
    const allRows = sheetData.values || []

    if (allRows.length === 0) {
      return {
        success: true,
        output: {
          rows: [],
          rowCount: 0,
          totalRows: 0,
          headers: [],
          range: queryRange
        },
        message: "No data found in the specified range"
      }
    }

    const headers = allRows[0] || []
    let dataRows = allRows.slice(1)

    // Apply keyword search
    if (keywordSearch) {
      const searchLower = keywordSearch.toLowerCase()
      dataRows = dataRows.filter(row => 
        row.some((cell: any) => 
          cell && cell.toString().toLowerCase().includes(searchLower)
        )
      )
    }

    // Apply column filter
    if (filterColumn && filterOperator) {
      let columnIndex = -1
      if (/^[A-Z]+$/i.test(filterColumn)) {
        columnIndex = filterColumn.toUpperCase().charCodeAt(0) - 65
      } else {
        columnIndex = headers.findIndex((h: string) => h === filterColumn)
      }

      if (columnIndex >= 0) {
        dataRows = dataRows.filter(row => {
          const cellValue = row[columnIndex] || ''
          const compareValue = filterValue || ''

          switch (filterOperator) {
            case 'equals':
              return cellValue === compareValue
            case 'not_equals':
              return cellValue !== compareValue
            case 'contains':
              return cellValue.toString().toLowerCase().includes(compareValue.toLowerCase())
            case 'not_contains':
              return !cellValue.toString().toLowerCase().includes(compareValue.toLowerCase())
            case 'starts_with':
              return cellValue.toString().toLowerCase().startsWith(compareValue.toLowerCase())
            case 'ends_with':
              return cellValue.toString().toLowerCase().endsWith(compareValue.toLowerCase())
            case 'greater_than':
              return parseFloat(cellValue) > parseFloat(compareValue)
            case 'less_than':
              return parseFloat(cellValue) < parseFloat(compareValue)
            case 'greater_equal':
              return parseFloat(cellValue) >= parseFloat(compareValue)
            case 'less_equal':
              return parseFloat(cellValue) <= parseFloat(compareValue)
            case 'is_empty':
              return !cellValue || cellValue === ''
            case 'is_not_empty':
              return cellValue && cellValue !== ''
            default:
              return true
          }
        })
      }
    }

    // Apply additional filters
    for (const filter of additionalFilters) {
      const { column, operator, value } = filter
      let columnIndex = -1
      
      if (/^[A-Z]+$/i.test(column)) {
        columnIndex = column.toUpperCase().charCodeAt(0) - 65
      } else {
        columnIndex = headers.findIndex((h: string) => h === column)
      }

      if (columnIndex >= 0) {
        dataRows = dataRows.filter(row => {
          const cellValue = row[columnIndex] || ''
          const compareValue = resolveValue(value, input) || ''

          switch (operator) {
            case 'equals':
              return cellValue === compareValue
            case 'not_equals':
              return cellValue !== compareValue
            case 'contains':
              return cellValue.toString().toLowerCase().includes(compareValue.toLowerCase())
            case 'starts_with':
              return cellValue.toString().toLowerCase().startsWith(compareValue.toLowerCase())
            case 'ends_with':
              return cellValue.toString().toLowerCase().endsWith(compareValue.toLowerCase())
            case 'greater_than':
              return parseFloat(cellValue) > parseFloat(compareValue)
            case 'less_than':
              return parseFloat(cellValue) < parseFloat(compareValue)
            case 'is_empty':
              return !cellValue || cellValue === ''
            case 'is_not_empty':
              return cellValue && cellValue !== ''
            default:
              return true
          }
        })
      }
    }

    // Apply date filter
    if (dateFilter && dateColumn) {
      let columnIndex = -1
      if (/^[A-Z]+$/i.test(dateColumn)) {
        columnIndex = dateColumn.toUpperCase().charCodeAt(0) - 65
      } else {
        columnIndex = headers.findIndex((h: string) => h === dateColumn)
      }

      if (columnIndex >= 0) {
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        
        dataRows = dataRows.filter(row => {
          const cellValue = row[columnIndex]
          if (!cellValue) return false
          
          const cellDate = new Date(cellValue)
          if (isNaN(cellDate.getTime())) return false

          switch (dateFilter) {
            case 'today':
              return cellDate.toDateString() === today.toDateString()
            case 'yesterday':
              const yesterday = new Date(today)
              yesterday.setDate(yesterday.getDate() - 1)
              return cellDate.toDateString() === yesterday.toDateString()
            case 'this_week':
              const weekStart = new Date(today)
              weekStart.setDate(weekStart.getDate() - weekStart.getDay())
              const weekEnd = new Date(weekStart)
              weekEnd.setDate(weekEnd.getDate() + 6)
              return cellDate >= weekStart && cellDate <= weekEnd
            case 'last_week':
              const lastWeekEnd = new Date(today)
              lastWeekEnd.setDate(lastWeekEnd.getDate() - lastWeekEnd.getDay() - 1)
              const lastWeekStart = new Date(lastWeekEnd)
              lastWeekStart.setDate(lastWeekStart.getDate() - 6)
              return cellDate >= lastWeekStart && cellDate <= lastWeekEnd
            case 'this_month':
              return cellDate.getMonth() === today.getMonth() && cellDate.getFullYear() === today.getFullYear()
            case 'last_month':
              const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
              return cellDate.getMonth() === lastMonth.getMonth() && cellDate.getFullYear() === lastMonth.getFullYear()
            case 'last_7_days':
              const sevenDaysAgo = new Date(today)
              sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
              return cellDate >= sevenDaysAgo && cellDate <= now
            case 'last_30_days':
              const thirtyDaysAgo = new Date(today)
              thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
              return cellDate >= thirtyDaysAgo && cellDate <= now
            case 'last_90_days':
              const ninetyDaysAgo = new Date(today)
              ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
              return cellDate >= ninetyDaysAgo && cellDate <= now
            case 'this_year':
              return cellDate.getFullYear() === today.getFullYear()
            case 'custom_range':
              if (customDateRange && customDateRange.start && customDateRange.end) {
                const startDate = new Date(customDateRange.start)
                const endDate = new Date(customDateRange.end)
                return cellDate >= startDate && cellDate <= endDate
              }
              return true
            default:
              return true
          }
        })
      }
    }

    // Apply sorting
    if (sortColumn) {
      let columnIndex = -1
      if (/^[A-Z]+$/i.test(sortColumn)) {
        columnIndex = sortColumn.toUpperCase().charCodeAt(0) - 65
      } else {
        columnIndex = headers.findIndex((h: string) => h === sortColumn)
      }

      if (columnIndex >= 0) {
        dataRows.sort((a, b) => {
          const aVal = a[columnIndex] || ''
          const bVal = b[columnIndex] || ''
          
          // Try numeric comparison first
          const aNum = parseFloat(aVal)
          const bNum = parseFloat(bVal)
          
          if (!isNaN(aNum) && !isNaN(bNum)) {
            return sortOrder === 'asc' ? aNum - bNum : bNum - aNum
          }
          
          // Fall back to string comparison
          const comparison = aVal.toString().localeCompare(bVal.toString())
          return sortOrder === 'asc' ? comparison : -comparison
        })
      }
    }

    // Apply row limit
    let limit = maxRows
    if (recordLimit && recordLimit !== 'custom') {
      limit = parseInt(recordLimit) || maxRows
    }
    
    const totalRows = dataRows.length
    dataRows = dataRows.slice(0, limit)

    // Format output
    let formattedRows: any
    
    if (outputFormat === 'objects') {
      formattedRows = dataRows.map(row => {
        const obj: Record<string, any> = {}
        headers.forEach((header: string, index: number) => {
          if (header) {
            obj[header] = row[index] || ''
          }
        })
        return obj
      })
    } else if (outputFormat === 'arrays') {
      formattedRows = dataRows
    } else if (outputFormat === 'csv') {
      const csvRows = includeHeaders ? [headers, ...dataRows] : dataRows
      formattedRows = csvRows.map(row => 
        row.map((cell: any) => {
          const value = (cell || '').toString()
          return value.includes(',') || value.includes('"') || value.includes('\n') 
            ? `"${value.replace(/"/g, '""')}"` 
            : value
        }).join(',')
      ).join('\n')
    } else if (outputFormat === 'json') {
      const jsonData = dataRows.map(row => {
        const obj: Record<string, any> = {}
        headers.forEach((header: string, index: number) => {
          if (header) {
            obj[header] = row[index] || ''
          }
        })
        return obj
      })
      formattedRows = JSON.stringify(jsonData, null, 2)
    }

    return {
      success: true,
      output: {
        rows: formattedRows,
        rowCount: dataRows.length,
        totalRows: totalRows,
        headers: includeHeaders ? headers : [],
        range: queryRange,
        spreadsheetId: spreadsheetId,
        sheetName: sheetName
      },
      message: `Successfully retrieved ${dataRows.length} row(s) from ${sheetName}`
    }

  } catch (error: any) {
    logger.error("Google Sheets list rows error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while listing rows"
    }
  }
}