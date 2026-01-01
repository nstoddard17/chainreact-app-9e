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
}

export function GoogleSheetsUpdateRowPreview({
  values,
  previewData,
  showPreviewData,
  loadingPreview,
  fieldKey,
  onTogglePreview,
  onLoadPreviewData,
  setValue
}: GoogleSheetsUpdateRowPreviewProps) {
  const hasHeaders = true; // Assume headers for now

  // Get column headers from preview data
  const allColumns = previewData.length > 0 && previewData[0].fields
    ? Object.keys(previewData[0].fields).filter(key => !key.startsWith('_'))
    : [];

  // Handle row click to select it
  const handleRowClick = (row: any) => {
    // Store the row number for the update
    setValue('rowNumber', row.rowNumber);

    // Initialize all column fields with current values from the selected row
    if (row.fields) {
      Object.entries(row.fields).forEach(([columnName, value]) => {
        if (!columnName.startsWith('_')) {
          const fieldKey = `column_${columnName}`;
          setValue(fieldKey, String(value ?? ''));
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

  return (
    <>
      <div key={fieldKey} className="mt-4 space-y-4">
        {/* Instructions - only show when table is loaded */}
        {showPreviewData && previewData.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200 font-medium">
              Click a row to select it for editing
            </p>
          </div>
        )}

        {/* Loading State */}
        {loadingPreview && (
          <div className="flex items-center justify-center py-8 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent"></div>
              <span className="text-sm">Loading sheet data...</span>
            </div>
          </div>
        )}

        {/* Initial state - waiting for data to load */}
        {!loadingPreview && !showPreviewData && values.spreadsheetId && values.sheetName && (
          <div className="flex items-center justify-center py-8 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
            <div className="text-center">
              <Database className="h-12 w-12 mx-auto mb-3 text-slate-400" />
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Preparing to load sheet data...
              </p>
            </div>
          </div>
        )}

        {/* Spreadsheet Preview Table */}
        {showPreviewData && (
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
            <div className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-t-lg">
              <div>
                <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Sheet Preview: {values.sheetName}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {values.rowNumber ? `Row ${values.rowNumber} selected` : 'Click a row to select it'}
                </p>
              </div>
            </div>

            {/* Table */}
            <div>
              {previewData.length > 0 ? (
                <div className="max-h-[400px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white dark:bg-slate-800 z-10">
                      <TableRow>
                        <TableHead className="w-[80px] text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">Row</TableHead>
                        {allColumns.map((column) => (
                          <TableHead key={column} className="text-xs">
                            {column}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.slice(0, 50).map((row) => {
                        const isSelected = row.rowNumber === values.rowNumber;

                        return (
                          <TableRow
                            key={row.id}
                            onClick={() => handleRowClick(row)}
                            className={`cursor-pointer transition-colors ${
                              isSelected ? 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                            }`}
                          >
                            <TableCell className={`text-xs font-mono font-medium ${
                              isSelected ? 'text-blue-700 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'
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
                <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                  <Database className="h-12 w-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm">No rows found in this sheet</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
