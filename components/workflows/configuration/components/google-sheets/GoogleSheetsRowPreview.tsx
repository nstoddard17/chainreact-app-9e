"use client"

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Database } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface GoogleSheetsRowPreviewProps {
  values: Record<string, any>;
  previewData: any[];
  showPreviewData: boolean;
  loadingPreview: boolean;
  fieldKey: string;
  onTogglePreview: () => void;
  onLoadPreviewData: (spreadsheetId: string, sheetName: string) => void;
  setValue: (key: string, value: any) => void;
}

export function GoogleSheetsRowPreview({
  values,
  previewData,
  showPreviewData,
  loadingPreview,
  fieldKey,
  onTogglePreview,
  onLoadPreviewData,
  setValue
}: GoogleSheetsRowPreviewProps) {
  const [selectedRowNumber, setSelectedRowNumber] = useState<number | null>(
    values.rowNumber ? parseInt(values.rowNumber) : null
  );

  // Get column headers - show all columns with horizontal scrolling
  const allColumns = previewData.length > 0 && previewData[0].fields
    ? Object.keys(previewData[0].fields).filter(key => !key.startsWith('_'))
    : [];
  const columns = allColumns; // Show all columns

  // Handle row number click to select that row
  const handleRowClick = (rowNumber: number) => {
    setSelectedRowNumber(rowNumber);
    setValue('rowNumber', rowNumber.toString());
  };

  const handleClearSelection = () => {
    setSelectedRowNumber(null);
    setValue('rowNumber', '');
  };

  // Automatically load preview data when sheet is selected
  useEffect(() => {
    if (values.spreadsheetId && values.sheetName && !showPreviewData && !loadingPreview) {
      onLoadPreviewData(values.spreadsheetId, values.sheetName);
    }
  }, [values.spreadsheetId, values.sheetName]);

  return (
    <>
      <div key={fieldKey} className="mt-4 space-y-4">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <p className="text-sm text-slate-600 mb-3">
            Click a row number to select which row to clear. This row will be cleared every time the workflow runs.
          </p>

          <div className="flex items-center gap-3 flex-wrap">
            {loadingPreview && (
              <div className="flex items-center gap-2 text-slate-600">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent"></div>
                <span className="text-sm">Loading preview...</span>
              </div>
            )}

            {selectedRowNumber && (
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-md text-sm">
                <span className="font-mono font-medium">
                  Row {selectedRowNumber}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearSelection}
                  className="h-5 w-5 p-0 hover:bg-blue-100"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Spreadsheet Preview Table */}
        {showPreviewData && (
          <div className="border border-slate-200 rounded-lg bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 rounded-t-lg">
              <div>
                <h3 className="text-sm font-medium text-slate-900">
                  Sheet Preview: {values.sheetName}
                </h3>
                <p className="text-xs text-slate-600">
                  Click a row number to select which row to clear
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
                        {columns.map((column) => (
                          <TableHead key={column} className="text-xs">
                            {column}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.slice(0, 50).map((row) => {
                        const rowNumber = row.rowNumber || row.id;
                        const isSelected = selectedRowNumber === rowNumber;

                        return (
                          <TableRow
                            key={row.id}
                            className={`transition-colors cursor-pointer ${
                              isSelected ? 'bg-blue-600 hover:bg-blue-700' : 'hover:bg-slate-50'
                            }`}
                            onClick={() => handleRowClick(rowNumber)}
                          >
                            <TableCell
                              className={`text-xs font-mono font-medium ${
                                isSelected
                                  ? 'text-white'
                                  : 'text-slate-600'
                              }`}
                            >
                              {rowNumber}
                            </TableCell>
                            {columns.map((column) => (
                              <TableCell
                                key={column}
                                className={`text-xs max-w-[200px] truncate ${
                                  isSelected ? 'text-white' : ''
                                }`}
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
      </div>
    </>
  );
}
