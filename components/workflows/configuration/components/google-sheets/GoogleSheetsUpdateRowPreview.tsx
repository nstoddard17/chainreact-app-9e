"use client"

import React, { useState, useEffect } from "react";
import { Database } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface GoogleSheetsUpdateRowPreviewProps {
  values: Record<string, any>;
  previewData: any[];
  showPreviewData: boolean;
  loadingPreview: boolean;
  fieldKey: string;
  onTogglePreview: () => void;
  onLoadPreviewData: (spreadsheetId: string, sheetName: string, hasHeaders: boolean) => void;
  setValue: (key: string, value: any) => void;
  workflowData?: any;
  currentNodeId?: string;
}

export function GoogleSheetsUpdateRowPreview({
  values,
  previewData,
  showPreviewData,
  loadingPreview,
  fieldKey,
  onTogglePreview,
  onLoadPreviewData,
  setValue,
  workflowData,
  currentNodeId
}: GoogleSheetsUpdateRowPreviewProps) {
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const hasHeaders = true; // Assume headers for now

  // Get column headers from preview data
  const allColumns = previewData.length > 0 && previewData[0].fields
    ? Object.keys(previewData[0].fields).filter(key => !key.startsWith('_'))
    : [];

  // Get the selected row data
  const selectedRow = selectedRowId
    ? previewData.find(row => row.id === selectedRowId)
    : null;

  // Handle row click to select it
  const handleRowClick = (row: any) => {
    setSelectedRowId(row.id);
    // Store the row number for the update
    setValue('rowNumber', row.rowNumber);

    // Initialize all column fields with current values
    if (row.fields) {
      Object.entries(row.fields).forEach(([columnName, value]) => {
        if (!columnName.startsWith('_')) {
          setValue(`column_${columnName}`, String(value ?? ''));
        }
      });
    }
  };

  // Automatically load preview data when sheet is selected
  useEffect(() => {
    if (values.spreadsheetId && values.sheetName && !showPreviewData && !loadingPreview) {
      onLoadPreviewData(values.spreadsheetId, values.sheetName, hasHeaders);
    }
  }, [values.spreadsheetId, values.sheetName]);

  // Detect field type based on value
  const detectFieldType = (value: any) => {
    const strValue = String(value ?? '');

    if (strValue.startsWith('http') &&
        (strValue.includes('.jpg') || strValue.includes('.jpeg') ||
         strValue.includes('.png') || strValue.includes('.gif') ||
         strValue.includes('.webp') || strValue.includes('.svg'))) {
      return 'image';
    }

    if (strValue.startsWith('http://') || strValue.startsWith('https://')) {
      return 'url';
    }

    if (strValue.includes('@') && strValue.includes('.')) {
      return 'email';
    }

    if (strValue.toLowerCase() === 'true' || strValue.toLowerCase() === 'false') {
      return 'boolean';
    }

    if (!isNaN(Number(strValue)) && strValue !== '') {
      return 'number';
    }

    if (!isNaN(Date.parse(strValue)) && (strValue.includes('-') || strValue.includes('/'))) {
      return 'date';
    }

    return 'text';
  };

  return (
    <>
      <div key={fieldKey} className="mt-4 space-y-4">
        {/* Instructions */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <p className="text-sm text-slate-600">
            Click a row to select it, then update the column values below.
          </p>
        </div>

        {/* Loading State */}
        {loadingPreview && (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2 text-slate-600">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent"></div>
              <span className="text-sm">Loading preview...</span>
            </div>
          </div>
        )}

        {/* Spreadsheet Preview Table */}
        {showPreviewData && (
          <div className="border border-slate-200 rounded-lg bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 rounded-t-lg">
              <div>
                <h3 className="text-sm font-medium text-slate-900">
                  Sheet Preview: {values.sheetName}
                </h3>
                <p className="text-xs text-slate-600">
                  {selectedRowId ? `Row ${selectedRow?.rowNumber} selected` : 'Click a row to select it'}
                </p>
              </div>
            </div>

            {/* Table */}
            <div>
              {previewData.length > 0 ? (
                <div className="max-h-[400px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white z-10">
                      <TableRow>
                        <TableHead className="w-[80px] text-xs font-medium text-slate-600 uppercase">Row</TableHead>
                        {allColumns.map((column) => (
                          <TableHead key={column} className="text-xs">
                            {column}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.slice(0, 50).map((row) => {
                        const isSelected = row.id === selectedRowId;

                        return (
                          <TableRow
                            key={row.id}
                            onClick={() => handleRowClick(row)}
                            className={`cursor-pointer transition-colors ${
                              isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-slate-50'
                            }`}
                          >
                            <TableCell className={`text-xs font-mono font-medium ${
                              isSelected ? 'text-blue-700' : 'text-slate-600'
                            }`}>
                              {row.rowNumber || row.id}
                            </TableCell>
                            {allColumns.map((column) => (
                              <TableCell
                                key={column}
                                className="text-xs max-w-[200px] truncate"
                              >
                                {row.fields[column] !== null && row.fields[column] !== undefined
                                  ? String(row.fields[column])
                                  : ''}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500">
                  <Database className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                  <p className="text-sm">No rows found in this sheet</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Column Update Fields - Show below table when a row is selected */}
        {selectedRow && allColumns.length > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-3">
                  Update Row {selectedRow.rowNumber}
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Edit the fields below. Only modified fields will be updated.
                </p>
              </div>

              {/* Display all columns as individual fields */}
              <div className="space-y-3">
                {allColumns.map((columnName) => {
                  const currentValue = selectedRow.fields[columnName];
                  const fieldType = detectFieldType(currentValue);
                  const fieldKey = `column_${columnName}`;

                  return (
                    <div key={columnName}>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        {columnName}
                      </label>

                      {/* Different input types based on detected field type */}
                      {fieldType === 'boolean' ? (
                        <div className="flex items-center space-x-3">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={values[fieldKey] === 'true' || values[fieldKey] === true}
                              onChange={(e) => setValue(fieldKey, e.target.checked.toString())}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            <span className="ml-3 text-sm text-slate-600">
                              {values[fieldKey] === 'true' || values[fieldKey] === true ? 'True' : 'False'}
                            </span>
                          </label>
                        </div>
                      ) : fieldType === 'date' ? (
                        <input
                          type="date"
                          value={values[fieldKey] ? String(values[fieldKey]).split('T')[0] : ''}
                          onChange={(e) => setValue(fieldKey, e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      ) : fieldType === 'number' ? (
                        <input
                          type="number"
                          value={values[fieldKey] ?? ''}
                          onChange={(e) => setValue(fieldKey, e.target.value)}
                          placeholder="Enter number or drag a variable"
                          className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      ) : fieldType === 'email' ? (
                        <input
                          type="email"
                          value={values[fieldKey] ?? ''}
                          onChange={(e) => setValue(fieldKey, e.target.value)}
                          placeholder="Enter email or drag a variable"
                          className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      ) : fieldType === 'url' || fieldType === 'image' ? (
                        <input
                          type="url"
                          value={values[fieldKey] ?? ''}
                          onChange={(e) => setValue(fieldKey, e.target.value)}
                          placeholder="Enter URL or drag a variable"
                          className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      ) : (
                        <input
                          type="text"
                          value={values[fieldKey] ?? ''}
                          onChange={(e) => setValue(fieldKey, e.target.value)}
                          placeholder="Enter new value or drag a variable"
                          className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
