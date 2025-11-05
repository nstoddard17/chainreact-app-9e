"use client"

import React from "react";
import { Button } from "@/components/ui/button";
import { ProfessionalSearch } from "@/components/ui/professional-search";
import { Eye, ChevronDown, X, Database } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { filterRecordsbySearch } from "../../utils/helpers";

interface MicrosoftExcelDataPreviewProps {
  values: Record<string, any>;
  previewData: any[];
  showPreviewData: boolean;
  loadingPreview: boolean;
  tableSearchQuery: string;
  tableDisplayCount: number;
  microsoftExcelSortField: string | null;
  microsoftExcelSortDirection: 'asc' | 'desc';
  microsoftExcelSelectedRows: Set<string>;
  microsoftExcelHasHeaders: boolean;
  fieldKey: string;
  onTogglePreview: () => void;
  onLoadPreviewData: (workbookId: string, worksheetName: string, hasHeaders: boolean) => void;
  onSearchChange: (query: string) => void;
  onDisplayCountChange: (count: number) => void;
  onSortFieldChange: (field: string | null) => void;
  onSortDirectionChange: (direction: 'asc' | 'desc') => void;
  onRowSelect: (rowId: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onHasHeadersChange: (hasHeaders: boolean) => void;
  onRowClick?: (row: any) => void;
}

export function MicrosoftExcelDataPreview({
  values,
  previewData,
  showPreviewData,
  loadingPreview,
  tableSearchQuery,
  tableDisplayCount,
  microsoftExcelSortField,
  microsoftExcelSortDirection,
  microsoftExcelSelectedRows,
  microsoftExcelHasHeaders,
  fieldKey,
  onTogglePreview,
  onLoadPreviewData,
  onSearchChange,
  onDisplayCountChange,
  onSortFieldChange,
  onSortDirectionChange,
  onRowSelect,
  onSelectAll,
  onHasHeadersChange,
  onRowClick
}: MicrosoftExcelDataPreviewProps) {
  // Filter and sort the data
  let filteredData = filterRecordsbySearch(previewData, tableSearchQuery);

  // Apply sorting if a field is selected
  if (microsoftExcelSortField && filteredData.length > 0) {
    filteredData = [...filteredData].sort((a, b) => {
      const aVal = a.fields?.[microsoftExcelSortField] || '';
      const bVal = b.fields?.[microsoftExcelSortField] || '';

      const comparison = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return microsoftExcelSortDirection === 'asc' ? comparison : -comparison;
    });
  }

  // Apply pagination
  const displayCount = tableDisplayCount === -1 ? filteredData.length : tableDisplayCount;
  const paginatedData = filteredData.slice(0, displayCount);

  // Get column headers - limit to first 5 for display
  const allColumns = filteredData.length > 0 && filteredData[0].fields
    ? Object.keys(filteredData[0].fields).filter(key => !key.startsWith('_'))
    : [];
  const columns = allColumns.slice(0, 5);
  const hasMoreColumns = allColumns.length > 5;

  return (
    <div key={fieldKey} className="mt-6 space-y-4">
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <p className="text-sm text-slate-600 mb-3">
          {values.action === 'update' && values.findRowBy === 'row_number'
            ? "Select a row from the worksheet to update. Click on any row to set it as the row to update."
            : values.action === 'update'
            ? "Preview your worksheet data to see what will be updated."
            : values.action === 'delete' && values.deleteRowBy === 'row_number'
            ? "Enter the row number to delete or preview your worksheet data."
            : values.action === 'delete'
            ? "View your worksheet to configure deletion criteria."
            : values.action === 'add'
            ? "Preview your worksheet to see the column structure. The fields below will be populated based on your worksheet columns."
            : "Preview your worksheet data."
          }
        </p>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="hasHeaders"
              checked={microsoftExcelHasHeaders}
              onCheckedChange={onHasHeadersChange}
            />
            <Label htmlFor="hasHeaders" className="text-sm text-slate-600">
              First row contains headers
            </Label>
          </div>

          <Button
            onClick={() => {
              if (showPreviewData) {
                onTogglePreview();
              } else {
                onTogglePreview();
                if (values.workbookId && values.worksheetName) {
                  onLoadPreviewData(values.workbookId, values.worksheetName, microsoftExcelHasHeaders);
                }
              }
            }}
            variant="outline"
            size="sm"
            disabled={loadingPreview || !values.workbookId || !values.worksheetName}
          >
            {loadingPreview ? (
              <>Loading...</>
            ) : showPreviewData ? (
              <>
                <X className="h-4 w-4 mr-2" />
                Hide Preview
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-2" />
                Preview Worksheet
              </>
            )}
          </Button>
        </div>

        {showPreviewData && !loadingPreview && (
          <>
            {/* Search and Display Controls */}
            <div className="flex gap-2 mb-4">
              <div className="flex-1">
                <ProfessionalSearch
                  placeholder="Search across all columns..."
                  value={tableSearchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  onClear={() => onSearchChange('')}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onDisplayCountChange(tableDisplayCount === 25 ? 50 : tableDisplayCount === 50 ? 100 : tableDisplayCount === 100 ? -1 : 25);
                }}
              >
                Show: {tableDisplayCount === -1 ? 'All' : tableDisplayCount}
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </div>

            {/* Data Table */}
            {paginatedData.length > 0 ? (
              <div className="border rounded-lg">
                <ScrollArea className="h-[300px] w-full">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">
                          <Checkbox
                            checked={microsoftExcelSelectedRows.size === paginatedData.length && paginatedData.length > 0}
                            onCheckedChange={(checked) => onSelectAll(checked as boolean)}
                          />
                        </TableHead>
                        <TableHead className="w-[80px]">Row</TableHead>
                        {columns.map((col, colIndex) => (
                          <TableHead
                            key={`header-${col}-${colIndex}`}
                            className="cursor-pointer hover:bg-gray-50"
                            onClick={() => {
                              if (microsoftExcelSortField === col) {
                                onSortDirectionChange(microsoftExcelSortDirection === 'asc' ? 'desc' : 'asc');
                              } else {
                                onSortFieldChange(col);
                                onSortDirectionChange('asc');
                              }
                            }}
                          >
                            <div className="flex items-center">
                              {col}
                              {microsoftExcelSortField === col && (
                                <span className="ml-1">
                                  {microsoftExcelSortDirection === 'asc' ? '↑' : '↓'}
                                </span>
                              )}
                            </div>
                          </TableHead>
                        ))}
                        {hasMoreColumns && (
                          <TableHead className="text-gray-400">
                            +{allColumns.length - 5} more columns
                          </TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedData.map((row, rowIndex) => (
                        <TableRow
                          key={row.id}
                          className={`
                            ${rowIndex % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800/50' : 'bg-white dark:bg-gray-900'}
                            hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-gray-900 dark:hover:text-gray-100
                            ${onRowClick ? 'cursor-pointer' : ''}
                            ${microsoftExcelSelectedRows.has(row.id) ? 'bg-blue-100 dark:bg-blue-900/50' : ''}
                          `}
                          onClick={() => onRowClick?.(row)}
                        >
                          <TableCell>
                            <Checkbox
                              checked={microsoftExcelSelectedRows.has(row.id)}
                              onCheckedChange={(checked) => {
                                onRowSelect(row.id, checked as boolean);
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.rowNumber || row.id}
                          </TableCell>
                          {columns.map((col, colIndex) => (
                            <TableCell key={`${row.id}-${col}-${colIndex}`} className="max-w-[200px] truncate">
                              {row.fields?.[col] || ''}
                            </TableCell>
                          ))}
                          {hasMoreColumns && (
                            <TableCell className="text-gray-400">...</TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>

                {filteredData.length > paginatedData.length && (
                  <div className="border-t px-4 py-2 text-sm text-gray-500">
                    Showing {paginatedData.length} of {filteredData.length} rows
                    {tableSearchQuery && ` (filtered from ${previewData.length} total)`}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                <Database className="h-12 w-12 mb-2 opacity-50" />
                <p className="text-sm">
                  {tableSearchQuery
                    ? "No rows match your search criteria"
                    : "No data found in this worksheet"}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}