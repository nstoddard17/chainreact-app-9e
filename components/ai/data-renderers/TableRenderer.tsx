"use client"

import React, { useState } from "react"
import { Table as TableIcon, ChevronLeft, ChevronRight, SortAsc, SortDesc } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProfessionalSearch } from "@/components/ui/professional-search"
import { cn } from "@/lib/utils"

interface TableRendererProps {
  tableName?: string
  headers?: string[]
  rows: Array<Record<string, any>>
  totalRows?: number
  maxRowsPerPage?: number
  className?: string
  searchable?: boolean
  sortable?: boolean
}

export function TableRenderer({
  tableName,
  headers,
  rows,
  totalRows,
  maxRowsPerPage = 10,
  className,
  searchable = true,
  sortable = true
}: TableRendererProps) {
  const [currentPage, setCurrentPage] = useState(0)
  const [searchTerm, setSearchTerm] = useState("")
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  if (!rows || rows.length === 0) {
    return (
      <div className={cn("mt-3 p-4 bg-muted/50 rounded-lg border text-center", className)}>
        <TableIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No data found</p>
      </div>
    )
  }

  // Get headers from first row if not provided
  const tableHeaders = headers || Object.keys(rows[0] || {})

  // Filter rows based on search
  const filteredRows = searchTerm
    ? rows.filter(row =>
        tableHeaders.some(header =>
          String(row[header] || '').toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    : rows

  // Sort rows
  const sortedRows = sortColumn && sortable
    ? [...filteredRows].sort((a, b) => {
        const aVal = a[sortColumn]
        const bVal = b[sortColumn]

        // Handle null/undefined
        if (aVal === null || aVal === undefined) return sortDirection === 'asc' ? 1 : -1
        if (bVal === null || bVal === undefined) return sortDirection === 'asc' ? -1 : 1

        // Compare values
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
        }

        const aStr = String(aVal).toLowerCase()
        const bStr = String(bVal).toLowerCase()

        if (sortDirection === 'asc') {
          return aStr < bStr ? -1 : aStr > bStr ? 1 : 0
        } else {
          return aStr > bStr ? -1 : aStr < bStr ? 1 : 0
        }
      })
    : filteredRows

  // Pagination
  const totalPages = Math.ceil(sortedRows.length / maxRowsPerPage)
  const startIdx = currentPage * maxRowsPerPage
  const endIdx = Math.min(startIdx + maxRowsPerPage, sortedRows.length)
  const paginatedRows = sortedRows.slice(startIdx, endIdx)

  const handleSort = (column: string) => {
    if (!sortable) return

    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const formatCellValue = (value: any) => {
    if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (typeof value === 'object') return JSON.stringify(value)
    if (typeof value === 'string' && value.length > 100) {
      return (
        <span className="truncate block" title={value}>
          {value.substring(0, 100)}...
        </span>
      )
    }
    return String(value)
  }

  const formatHeaderName = (header: string) => {
    return header
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  return (
    <div className={cn("mt-3 space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TableIcon className="w-5 h-5 text-primary" />
          <span className="font-medium text-lg">{tableName || "Data Table"}</span>
          <Badge variant="secondary">{totalRows || rows.length} rows</Badge>
        </div>

        {searchable && (
          <div className="w-64">
            <ProfessionalSearch
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setCurrentPage(0)
              }}
              onClear={() => {
                setSearchTerm('')
                setCurrentPage(0)
              }}
              className="pl-8 h-8 text-sm"
            />
          </div>
        )}
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                {tableHeaders.map((header, index) => (
                  <th
                    key={index}
                    className={cn(
                      "px-4 py-3 text-left font-medium text-xs uppercase tracking-wide",
                      sortable && "cursor-pointer hover:bg-muted transition-colors"
                    )}
                    onClick={() => handleSort(header)}
                  >
                    <div className="flex items-center gap-2">
                      <span>{formatHeaderName(header)}</span>
                      {sortable && sortColumn === header && (
                        sortDirection === 'asc'
                          ? <SortAsc className="w-3 h-3" />
                          : <SortDesc className="w-3 h-3" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {paginatedRows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="hover:bg-muted/30 transition-colors"
                >
                  {tableHeaders.map((header, colIndex) => (
                    <td
                      key={colIndex}
                      className="px-4 py-3 text-sm max-w-xs"
                    >
                      {formatCellValue(row[header])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
            <div className="text-xs text-muted-foreground">
              Showing {startIdx + 1}-{endIdx} of {sortedRows.length} rows
              {searchTerm && ` (filtered from ${rows.length} total)`}
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                disabled={currentPage === 0}
                className="h-8"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <div className="text-xs text-muted-foreground">
                Page {currentPage + 1} of {totalPages}
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                disabled={currentPage >= totalPages - 1}
                className="h-8"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Summary */}
      {totalRows && totalRows > rows.length && (
        <div className="text-xs text-muted-foreground text-center">
          Displaying {rows.length} of {totalRows} total rows
        </div>
      )}
    </div>
  )
}
