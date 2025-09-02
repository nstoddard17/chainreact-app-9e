"use client"

import React, { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle } from "lucide-react";

interface GoogleSheetsDeleteConfirmationProps {
  values: Record<string, any>;
  setValue: (key: string, value: any) => void;
  selectedRows: Set<string>;
  previewData: any[];
  hasHeaders: boolean;
  action: string;
}

export function GoogleSheetsDeleteConfirmation({
  values,
  setValue,
  selectedRows,
  previewData,
  hasHeaders,
  action
}: GoogleSheetsDeleteConfirmationProps) {
  // Only show for delete action
  if (action !== 'delete') {
    return null;
  }

  // Get available columns from preview data
  const columns = previewData.length > 0 && previewData[0].fields 
    ? Object.keys(previewData[0].fields).filter(key => !key.startsWith('_'))
    : [];

  // Calculate matching rows for column_value method
  const matchingRows = values.deleteRowBy === 'column_value' && values.deleteSearchValue
    ? previewData.filter((row: any) => 
        row.fields && row.fields[values.deleteSearchColumn] === values.deleteSearchValue
      )
    : [];
  const rowsToShow = values.deleteAll ? matchingRows : matchingRows.slice(0, 1);

  return (
    <div className="mt-4 space-y-4">
      {/* Column Value Delete Configuration */}
      {values.deleteRowBy === 'column_value' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-red-900 mb-3">
            Configure Delete Criteria
          </h4>
          
          <div className="space-y-4">
            {/* Column Selection */}
            <div>
              <Label htmlFor="deleteSearchColumn" className="text-xs font-medium text-slate-700">
                Search Column
              </Label>
              <Select
                value={values.deleteSearchColumn || ''}
                onValueChange={(value) => setValue('deleteSearchColumn', value)}
              >
                <SelectTrigger className="w-full mt-1">
                  <SelectValue placeholder="Select a column to search in" />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((column) => (
                    <SelectItem key={column} value={column}>
                      {column}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-1">
                Choose the column that contains the value you want to search for
              </p>
            </div>

            {/* Search Value */}
            {values.deleteSearchColumn && (
              <div>
                <Label htmlFor="deleteSearchValue" className="text-xs font-medium text-slate-700">
                  Search Value
                </Label>
                <Input
                  id="deleteSearchValue"
                  type="text"
                  value={values.deleteSearchValue || ''}
                  onChange={(e) => setValue('deleteSearchValue', e.target.value)}
                  placeholder="Enter the value to search for"
                  className="mt-1"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Enter the exact value you want to find (e.g., 'john@example.com')
                </p>
              </div>
            )}

            {/* Delete All Toggle */}
            {values.deleteSearchValue && (
              <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-red-200">
                <div className="flex-1">
                  <Label htmlFor="deleteAll" className="text-sm font-medium text-slate-700 cursor-pointer">
                    Delete All Matches
                  </Label>
                  <p className="text-xs text-slate-500 mt-1">
                    {values.deleteAll 
                      ? `ALL ${matchingRows.length} matching row${matchingRows.length !== 1 ? 's' : ''} will be deleted`
                      : 'Only the FIRST matching row will be deleted'}
                  </p>
                </div>
                <Switch
                  id="deleteAll"
                  checked={values.deleteAll || false}
                  onCheckedChange={(checked) => setValue('deleteAll', checked)}
                  className="ml-3"
                />
              </div>
            )}

            {/* Preview of matching rows */}
            {values.deleteSearchValue && matchingRows.length > 0 && (
              <div className="bg-white border border-red-200 rounded-lg p-3">
                <p className="text-xs text-slate-700 mb-2 font-medium">
                  Preview of rows to be deleted:
                </p>
                <div className="max-h-24 overflow-auto bg-slate-50 rounded p-2">
                  {rowsToShow.map((row: any) => (
                    <div key={row.id} className="text-xs text-slate-600 py-1 border-b border-slate-200 last:border-0">
                      Row {row.rowNumber}: {Object.entries(row.fields || {}).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ')}
                      {Object.keys(row.fields || {}).length > 3 && '...'}
                    </div>
                  ))}
                  {values.deleteAll && matchingRows.length > 5 && (
                    <p className="text-xs text-slate-500 italic mt-1">
                      ... and {matchingRows.length - 5} more rows
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Warning if no matches */}
            {values.deleteSearchValue && matchingRows.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    No rows match the specified criteria. Nothing will be deleted.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manually Selected Rows (via checkboxes) */}
      {selectedRows.size > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-yellow-900 mb-2">
            Additional Rows Selected for Deletion
          </h4>
          <p className="text-xs text-yellow-700 mb-3">
            {selectedRows.size} row{selectedRows.size !== 1 ? 's' : ''} selected using checkboxes.
          </p>
          <div className="max-h-24 overflow-auto bg-white rounded border border-yellow-200 p-2">
            {Array.from(selectedRows).slice(0, 5).map(rowId => {
              const row = previewData.find(r => r.id === rowId);
              if (!row) return null;
              return (
                <div key={rowId} className="text-xs text-slate-600 py-1 border-b border-slate-100 last:border-0">
                  Row {row.rowNumber}: {Object.entries(row.fields || {}).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ')}
                  {Object.keys(row.fields || {}).length > 3 && '...'}
                </div>
              );
            })}
            {selectedRows.size > 5 && (
              <p className="text-xs text-slate-500 italic mt-2">
                ... and {selectedRows.size - 5} more rows
              </p>
            )}
          </div>
          {values.deleteRowBy === 'column_value' && values.deleteSearchValue && (
            <p className="text-xs text-amber-600 mt-2">
              ⚠️ These manually selected rows will be deleted in addition to any column value matches.
            </p>
          )}
        </div>
      )}

      {/* Row Number Delete Confirmation */}
      {values.deleteRowBy === 'row_number' && values.deleteRowNumber && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-red-900 mb-2">
                ⚠️ Confirm Delete Action
              </h3>
              <p className="text-xs text-red-700">
                This action cannot be undone. Row {values.deleteRowNumber} will be permanently deleted.
              </p>
            </div>
            
            {/* Preview the row that will be deleted */}
            {(() => {
              const rowToDelete = previewData.find(r => r.rowNumber === values.deleteRowNumber);
              if (rowToDelete) {
                return (
                  <div className="bg-white border border-red-200 rounded-lg p-3">
                    <p className="text-xs text-slate-700 mb-2 font-medium">
                      Row to be deleted:
                    </p>
                    <div className="bg-slate-50 rounded p-2">
                      <div className="text-xs text-slate-600">
                        Row {rowToDelete.rowNumber}: {Object.entries(rowToDelete.fields || {}).slice(0, 5).map(([k, v]) => `${k}: ${v}`).join(', ')}
                        {Object.keys(rowToDelete.fields || {}).length > 5 && '...'}
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}