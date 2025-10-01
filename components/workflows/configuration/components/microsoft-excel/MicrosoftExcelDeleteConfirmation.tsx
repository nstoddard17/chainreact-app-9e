"use client"

import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle } from "lucide-react";

interface MicrosoftExcelDeleteConfirmationProps {
  values: Record<string, any>;
  setValue: (key: string, value: any) => void;
  previewData: any[];
  hasHeaders: boolean;
  action: string;
}

export function MicrosoftExcelDeleteConfirmation({
  values,
  setValue,
  previewData,
  hasHeaders,
  action
}: MicrosoftExcelDeleteConfirmationProps) {
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
      {/* Show loading message if column_value is selected but no data loaded */}
      {values.deleteRowBy === 'column_value' && previewData.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-700">
                Load Worksheet Data First
              </p>
              <p className="text-xs text-amber-600 mt-1">
                Please select a worksheet above to preview your data and configure delete criteria.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Column Value Delete Configuration */}
      {values.deleteRowBy === 'column_value' && previewData.length > 0 && (
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
    </div>
  );
}