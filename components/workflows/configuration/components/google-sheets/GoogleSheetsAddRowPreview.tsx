"use client"

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, ChevronDown, X, Database, ChevronUp } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface GoogleSheetsAddRowPreviewProps {
  values: Record<string, any>;
  previewData: any[];
  showPreviewData: boolean;
  loadingPreview: boolean;
  fieldKey: string;
  onTogglePreview: () => void;
  onLoadPreviewData: (spreadsheetId: string, sheetName: string) => void;
  onSelectInsertPosition: (position: 'append' | 'prepend' | 'specific_row', rowNumber?: number) => void;
}

export function GoogleSheetsAddRowPreview({
  values,
  previewData,
  showPreviewData,
  loadingPreview,
  fieldKey,
  onTogglePreview,
  onLoadPreviewData,
  onSelectInsertPosition
}: GoogleSheetsAddRowPreviewProps) {
  const [selectedRow, setSelectedRow] = useState<any>(null);
  const [showInsertDialog, setShowInsertDialog] = useState(false);
  const [row1IsHeader, setRow1IsHeader] = useState(true);

  // Get column headers - limit to first 5 for display
  const allColumns = previewData.length > 0 && previewData[0].fields
    ? Object.keys(previewData[0].fields).filter(key => !key.startsWith('_'))
    : [];
  const columns = allColumns.slice(0, 5);
  const hasMoreColumns = allColumns.length > 5;

  const handleRowClick = (row: any) => {
    setSelectedRow(row);
    setShowInsertDialog(true);
  };

  const handleInsertAbove = () => {
    if (selectedRow) {
      onSelectInsertPosition('specific_row', selectedRow.rowNumber);
      setShowInsertDialog(false);
      setSelectedRow(null);
    }
  };

  const handleInsertBelow = () => {
    if (selectedRow) {
      onSelectInsertPosition('specific_row', selectedRow.rowNumber + 1);
      setShowInsertDialog(false);
      setSelectedRow(null);
    }
  };

  const handleInsertAtTop = () => {
    if (row1IsHeader) {
      onSelectInsertPosition('prepend'); // Insert at row 2 (after headers)
    } else {
      onSelectInsertPosition('specific_row', 1); // Insert at row 1
    }
    setShowInsertDialog(false);
  };

  const handleInsertAtBottom = () => {
    onSelectInsertPosition('append');
    setShowInsertDialog(false);
  };

  return (
    <>
      <div key={fieldKey} className="mt-4 space-y-4">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <p className="text-sm text-slate-600 mb-3">
            Preview your sheet to select where to insert the new row. Click any row to choose insert position above or below, or use quick actions for top/bottom.
          </p>

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (showPreviewData) {
                  onTogglePreview();
                } else {
                  onLoadPreviewData(values.spreadsheetId, values.sheetName);
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
              {loadingPreview ? 'Loading...' : showPreviewData ? 'Hide Preview' : 'Show Preview'}
            </Button>

            {/* Quick Insert Buttons */}
            {showPreviewData && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedRow(null);
                    setShowInsertDialog(true);
                  }}
                  className="flex items-center gap-2"
                >
                  <ChevronUp className="h-4 w-4" />
                  Insert at Top
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleInsertAtBottom}
                  className="flex items-center gap-2"
                >
                  <ChevronDown className="h-4 w-4" />
                  Insert at Bottom
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Spreadsheet Preview Table */}
        {showPreviewData && (
          <div className="border border-slate-200 rounded-lg bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 rounded-t-lg">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-slate-900">
                    Sheet Preview: {values.sheetName}
                  </h3>
                  <p className="text-xs text-slate-600">
                    Click any row to choose where to insert the new row
                  </p>
                </div>

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

            {/* Table */}
            <div>
              {previewData.length > 0 ? (
                <div className="max-h-[300px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white z-10">
                      <TableRow>
                        <TableHead className="w-[80px] text-xs font-medium text-slate-600 uppercase">Row</TableHead>
                        {columns.map((column) => (
                          <TableHead key={column} className="text-xs">
                            {column}
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
                      {previewData.slice(0, 50).map((row) => (
                        <TableRow
                          key={row.id}
                          className="cursor-pointer hover:bg-blue-50 transition-colors"
                          onClick={() => handleRowClick(row)}
                        >
                          <TableCell className="text-xs font-mono text-slate-600 font-medium">
                            {row.rowNumber || row.id}
                          </TableCell>
                          {columns.map((column) => (
                            <TableCell key={column} className="text-xs max-w-[200px] truncate">
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
                      ))}
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

      {/* Insert Position Dialog */}
      <Dialog open={showInsertDialog} onOpenChange={setShowInsertDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choose Insert Position</DialogTitle>
            <DialogDescription>
              {selectedRow
                ? `Where would you like to insert the new row relative to row ${selectedRow.rowNumber}?`
                : 'Configure how to insert the new row at the top of the sheet'}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-3">
            {selectedRow ? (
              <>
                {/* Insert Above/Below options */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleInsertAbove}
                  className="w-full justify-start gap-0 h-auto p-0 overflow-hidden"
                >
                  <div className="flex items-center justify-center w-10 h-full rounded-l bg-blue-50">
                    <ChevronUp className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="text-left py-2.5 px-3 flex-1">
                    <div className="font-medium">Insert Above Row {selectedRow.rowNumber}</div>
                    <div className="text-xs text-slate-500">New row will be inserted at position {selectedRow.rowNumber}</div>
                  </div>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleInsertBelow}
                  className="w-full justify-start gap-0 h-auto p-0 overflow-hidden"
                >
                  <div className="flex items-center justify-center w-10 h-full rounded-l bg-blue-50">
                    <ChevronDown className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="text-left py-2.5 px-3 flex-1">
                    <div className="font-medium">Insert Below Row {selectedRow.rowNumber}</div>
                    <div className="text-xs text-slate-500">New row will be inserted at position {selectedRow.rowNumber + 1}</div>
                  </div>
                </Button>
              </>
            ) : (
              <>
                {/* Insert at Top with header toggle */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <Switch
                      checked={row1IsHeader}
                      onCheckedChange={setRow1IsHeader}
                      id="row1-is-header"
                    />
                    <Label htmlFor="row1-is-header" className="text-sm cursor-pointer">
                      Row 1 contains headers
                    </Label>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleInsertAtTop}
                    className="w-full justify-start gap-0 h-auto p-0 overflow-hidden"
                  >
                    <div className="flex items-center justify-center w-10 h-full rounded-l bg-blue-50">
                      <ChevronUp className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="text-left py-2.5 px-3 flex-1">
                      <div className="font-medium">
                        {row1IsHeader ? 'Insert at Row 2 (After Headers)' : 'Insert at Row 1 (Very Top)'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {row1IsHeader
                          ? 'New row will be the first data row after headers'
                          : 'New row will be the absolute first row'}
                      </div>
                    </div>
                  </Button>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setShowInsertDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
