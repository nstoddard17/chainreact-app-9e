"use client"

import React from "react";
import { Button } from "@/components/ui/button";
import { Eye, Search, ChevronDown, X, Database } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { filterRecordsbySearch } from "../../utils/helpers";

interface GoogleSheetsDataPreviewProps {
  values: Record<string, any>;
  previewData: any[];
  showPreviewData: boolean;
  loadingPreview: boolean;
  tableSearchQuery: string;
  tableDisplayCount: number;
  googleSheetsSortField: string | null;
  googleSheetsSortDirection: 'asc' | 'desc';
  googleSheetsSelectedRows: Set<string>;
  googleSheetsHasHeaders: boolean;
  fieldKey: string;
  onTogglePreview: () => void;
  onLoadPreviewData: (spreadsheetId: string, sheetName: string, hasHeaders: boolean) => void;
  onSearchChange: (query: string) => void;
  onDisplayCountChange: (count: number) => void;
  onSortFieldChange: (field: string | null) => void;
  onSortDirectionChange: (direction: 'asc' | 'desc') => void;
  onRowSelect: (rowId: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onHasHeadersChange: (hasHeaders: boolean) => void;
  onRowClick?: (row: any) => void;
}

export function GoogleSheetsDataPreview({
  values,
  previewData,
  showPreviewData,
  loadingPreview,
  tableSearchQuery,
  tableDisplayCount,
  googleSheetsSortField,
  googleSheetsSortDirection,
  googleSheetsSelectedRows,
  googleSheetsHasHeaders,
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
}: GoogleSheetsDataPreviewProps) {
  // Filter and sort the data
  let filteredData = filterRecordsbySearch(previewData, tableSearchQuery);
  
  // Apply sorting if a field is selected
  if (googleSheetsSortField && filteredData.length > 0) {
    filteredData = [...filteredData].sort((a, b) => {
      const aVal = a.fields?.[googleSheetsSortField] || '';
      const bVal = b.fields?.[googleSheetsSortField] || '';
      
      const comparison = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return googleSheetsSortDirection === 'asc' ? comparison : -comparison;
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
            ? "Select a row from the sheet to update. Click on any row to set it as the row to update."
            : values.action === 'update'
            ? "Preview your sheet data to see what will be updated."
            : values.action === 'delete' && values.deleteRowBy === 'row_number'
            ? "Enter the row number to delete or preview your sheet data."
            : values.action === 'delete'
            ? "View your sheet to configure deletion criteria."
            : values.action === 'add'
            ? "Preview your sheet to see the column structure. The fields below will be populated based on your sheet columns."
            : "Preview your sheet data."
          }
        </p>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (showPreviewData) {
                onTogglePreview();
              } else {
                onLoadPreviewData(values.spreadsheetId, values.sheetName, googleSheetsHasHeaders);
              }
            }}
            disabled={loadingPreview}
            className="flex items-center gap-2"
          >
            {loadingPreview ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent"></div>
            ) : (
              <Eye className="h-4 w-4" />
            )}
            {loadingPreview ? 'Loading...' : showPreviewData ? 'Hide Rows' : 'Show Rows'}
          </Button>
          {showPreviewData && googleSheetsSelectedRows.size > 0 && (
            <span className="text-sm text-slate-600 font-medium">
              {googleSheetsSelectedRows.size} row{googleSheetsSelectedRows.size !== 1 ? 's' : ''} selected
            </span>
          )}
        </div>
      </div>
      
      {/* Google Sheets Rows Table for Selection */}
      {showPreviewData && (
        <div className="border border-slate-200 rounded-lg bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 rounded-t-lg">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-sm font-medium text-slate-900">
                  {values.action === 'update' ? 'Select Row: ' : values.action === 'delete' ? 'Delete Configuration: ' : values.action === 'add' ? 'Column Structure: ' : 'Sheet Data: '}{values.sheetName}
                </h3>
                <p className="text-xs text-slate-600">
                  {filteredData.length} row{filteredData.length !== 1 ? 's' : ''} 
                  {tableSearchQuery ? ' found' : ' total'}
                  {values.action === 'update' && values.findRowBy === 'row_number' && (
                    <span className="ml-1">(double-click a row to select it for update)</span>
                  )}
                  {values.action === 'delete' && (
                    <span className="ml-1">(select rows using checkboxes)</span>
                  )}
                </p>
              </div>
              
              {/* Search and Controls */}
              <div className="flex items-center gap-2">
                {/* Has Headers Toggle */}
                <div className="flex items-center gap-2 mr-2">
                  <Switch
                    checked={googleSheetsHasHeaders}
                    onCheckedChange={onHasHeadersChange}
                    id="has-headers"
                    className="data-[state=checked]:bg-blue-500 data-[state=unchecked]:bg-slate-200"
                  />
                  <Label htmlFor="has-headers" className="text-xs text-slate-600 cursor-pointer">
                    Has Headers
                  </Label>
                </div>
                
                {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Search rows..."
                    value={tableSearchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="h-7 w-48 pl-7 pr-2 text-xs"
                  />
                </div>
                
                {/* Display Count Selector */}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-600">Show:</span>
                  <select
                    value={tableDisplayCount}
                    onChange={(e) => onDisplayCountChange(parseInt(e.target.value))}
                    className="h-7 px-2 text-xs border border-slate-200 rounded"
                  >
                    <option value="10">10</option>
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="-1">All</option>
                  </select>
                </div>
                
                {/* Select All/None - Always visible */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (googleSheetsSelectedRows.size === paginatedData.length) {
                      onSelectAll(false);
                    } else {
                      onSelectAll(true);
                    }
                  }}
                  className="h-7 px-2 text-xs"
                >
                  {googleSheetsSelectedRows.size === paginatedData.length ? 'Deselect All' : 'Select All'}
                </Button>
                
                {/* Close Button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onTogglePreview}
                  className="h-6 w-6 p-0 hover:bg-red-50 hover:text-red-600"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
          
          {/* Table with reduced height to show 4-5 rows */}
          <div>
            {filteredData.length > 0 ? (
              <>
                <div className="max-h-[200px] overflow-auto">
                  <Table>
              <TableHeader className="sticky top-0 bg-white z-10">
                <TableRow>
                  {/* Always show checkbox column */}
                  <TableHead className="w-[40px] sticky left-0 bg-white">
                    <Checkbox
                      checked={googleSheetsSelectedRows.size === paginatedData.length && paginatedData.length > 0}
                      onCheckedChange={(checked) => onSelectAll(!!checked)}
                    />
                  </TableHead>
                  <TableHead className="w-[80px] text-xs font-medium text-slate-600 uppercase">Row</TableHead>
                  {columns.map((column) => (
                    <TableHead 
                      key={column} 
                      className="text-xs cursor-pointer hover:bg-slate-50"
                      onClick={() => {
                        if (googleSheetsSortField === column) {
                          onSortDirectionChange(googleSheetsSortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          onSortFieldChange(column);
                          onSortDirectionChange('asc');
                        }
                      }}
                    >
                      <div className="flex items-center gap-1">
                        {column}
                        {googleSheetsSortField === column && (
                          <ChevronDown className={`h-3 w-3 transition-transform ${googleSheetsSortDirection === 'desc' ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                    </TableHead>
                  ))}
                  {hasMoreColumns && (
                    <TableHead className="text-xs font-medium text-slate-600 uppercase">
                      +{allColumns.length - 5} more
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.map((row) => {
                  const isSelectedForUpdate = values.action === 'update' && values.updateRowNumber === row.rowNumber;
                  const isChecked = googleSheetsSelectedRows.has(row.id);
                  return (
                    <TableRow 
                      key={row.id}
                      className={`cursor-pointer hover:bg-blue-50 hover:text-white transition-colors ${
                        isSelectedForUpdate ? 'bg-blue-100 text-white' : isChecked ? 'bg-blue-50 text-white' : ''
                      }`}
                      onDoubleClick={() => {
                        // Double click to toggle checkbox and set as update target
                        onRowSelect(row.id, !isChecked);
                        if (values.action === 'update') {
                          onRowClick?.(row);
                        }
                      }}
                    >
                      {/* Always show checkbox */}
                      <TableCell className="sticky left-0 bg-white">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(checked) => onRowSelect(row.id, !!checked)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </TableCell>
                    <TableCell className={`text-xs font-mono ${
                      isSelectedForUpdate || isChecked ? '' : 'text-slate-600'
                    }`}>
                      {row.rowNumber || row.id}
                    </TableCell>
                    {columns.map((column) => (
                      <TableCell key={column} className={`text-xs max-w-[200px] truncate`}>
                        {row.fields[column] !== null && row.fields[column] !== undefined
                          ? String(row.fields[column])
                          : ''}
                      </TableCell>
                    ))}
                    {hasMoreColumns && (
                      <TableCell className="text-xs italic text-slate-500">
                        ...
                      </TableCell>
                    )}
                    </TableRow>
                  );
                })}
              </TableBody>
                  </Table>
                </div>
                
                {/* Pagination Info */}
                {filteredData.length > paginatedData.length && (
                  <div className="px-3 py-2 border-t border-slate-200 bg-slate-50 text-xs text-slate-600">
                    Showing {paginatedData.length} of {filteredData.length} rows
                    {tableDisplayCount !== -1 && (
                      <button
                        onClick={() => onDisplayCountChange(-1)}
                        className="ml-2 text-blue-600 hover:text-blue-700 underline"
                      >
                        Show all
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="p-8 text-center text-slate-500">
                <Database className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p className="text-sm">
                  {tableSearchQuery ? 'No rows match your search' : 'No rows found in this sheet'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}