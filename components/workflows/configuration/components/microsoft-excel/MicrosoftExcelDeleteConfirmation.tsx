"use client"

import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, X } from "lucide-react";

interface MicrosoftExcelDeleteConfirmationProps {
  values: Record<string, any>;
  setValue: (key: string, value: any) => void;
  previewData: any[];
  hasHeaders: boolean;
  action: string;
  showDeleteConfirmation: boolean;
  onCloseDeleteModal: () => void;
  onConfirmDelete: () => void;
}

export function MicrosoftExcelDeleteConfirmation({
  values,
  setValue,
  previewData,
  hasHeaders,
  action,
  showDeleteConfirmation,
  onCloseDeleteModal,
  onConfirmDelete
}: MicrosoftExcelDeleteConfirmationProps) {
  // Only show for delete action
  if (action !== 'delete' || !showDeleteConfirmation) {
    return null;
  }

  // Get column names from preview data for column value deletion
  const columns = previewData[0]?.fields ? Object.keys(previewData[0].fields).filter(key => !key.startsWith('_')) : [];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div className="border-b px-6 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h3 className="text-lg font-semibold">Confirm Row Deletion</h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCloseDeleteModal}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-6 py-4 overflow-y-auto max-h-[calc(80vh-140px)]">
          <div className="space-y-4">
            {/* Row Number Deletion */}
            {values.deleteRowBy === 'row_number' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-gray-700">
                  This will permanently delete <span className="font-semibold">Row {values.deleteRowNumber}</span> from the worksheet.
                </p>
              </div>
            )}

            {/* Range Deletion */}
            {values.deleteRowBy === 'range' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-gray-700">
                  This will permanently delete <span className="font-semibold">Rows {values.startRow} to {values.endRow}</span> from the worksheet.
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  Total rows to be deleted: <span className="font-semibold">{(values.endRow - values.startRow + 1) || 0}</span>
                </p>
              </div>
            )}

            {/* Column Value Deletion */}
            {values.deleteRowBy === 'column_value' && (
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Configure Deletion Criteria</h4>

                  {/* Column Selection */}
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Search in Column
                    </label>
                    <select
                      value={values.deleteSearchColumn || ''}
                      onChange={(e) => setValue('deleteSearchColumn', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <option value="">Select a column...</option>
                      {columns.map((col) => (
                        <option key={col} value={col}>
                          {hasHeaders ? col : `Column ${col}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Search Value */}
                  {values.deleteSearchColumn && (
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Value to Match
                      </label>
                      <input
                        type="text"
                        value={values.deleteSearchValue || ''}
                        onChange={(e) => setValue('deleteSearchValue', e.target.value)}
                        placeholder="Enter value to search for..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        All rows where {values.deleteSearchColumn} equals this value will be deleted
                      </p>
                    </div>
                  )}

                  {/* Delete All Matches */}
                  {values.deleteSearchColumn && values.deleteSearchValue && (
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="deleteAll"
                        checked={values.deleteAll || false}
                        onChange={(e) => setValue('deleteAll', e.target.checked)}
                        className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                      />
                      <label htmlFor="deleteAll" className="text-sm text-gray-700">
                        Delete ALL rows that match (not just the first one)
                      </label>
                    </div>
                  )}
                </div>

                {/* Preview of matching rows */}
                {values.deleteSearchColumn && values.deleteSearchValue && previewData.length > 0 && (
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Rows that will be deleted:</h4>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {previewData
                        .filter((row) => row.fields?.[values.deleteSearchColumn] === values.deleteSearchValue)
                        .map((row, index) => (
                          <div key={row.id} className="text-xs text-gray-600 bg-red-50 px-2 py-1 rounded">
                            Row {row.rowNumber || row.id}: {Object.entries(row.fields || {}).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ')}
                            {Object.keys(row.fields || {}).length > 3 && '...'}
                          </div>
                        ))
                      }
                      {previewData.filter((row) => row.fields?.[values.deleteSearchColumn] === values.deleteSearchValue).length === 0 && (
                        <p className="text-xs text-gray-500">No matching rows found</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Warning Message */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex">
                <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                <div className="ml-3">
                  <h4 className="text-sm font-medium text-yellow-900">This action cannot be undone</h4>
                  <p className="text-sm text-yellow-700 mt-1">
                    Once deleted, the data cannot be recovered. Please make sure you have a backup if needed.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t px-6 py-4 flex justify-end space-x-3">
          <Button variant="outline" onClick={onCloseDeleteModal}>
            Cancel
          </Button>
          <Button
            onClick={onConfirmDelete}
            className="bg-red-600 hover:bg-red-700"
            disabled={
              (values.deleteRowBy === 'column_value' && (!values.deleteSearchColumn || !values.deleteSearchValue)) ||
              (values.deleteRowBy === 'row_number' && !values.deleteRowNumber) ||
              (values.deleteRowBy === 'range' && (!values.startRow || !values.endRow))
            }
          >
            Delete Row{values.deleteRowBy === 'range' || values.deleteAll ? 's' : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}