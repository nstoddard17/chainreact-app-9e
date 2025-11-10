"use client"

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Database } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface GoogleSheetsRangePreviewProps {
  values: Record<string, any>;
  previewData: any[];
  showPreviewData: boolean;
  loadingPreview: boolean;
  fieldKey: string;
  onTogglePreview: () => void;
  onLoadPreviewData: (spreadsheetId: string, sheetName: string) => void;
  setValue: (key: string, value: any) => void;
}

export function GoogleSheetsRangePreview({
  values,
  previewData,
  showPreviewData,
  loadingPreview,
  fieldKey,
  onTogglePreview,
  onLoadPreviewData,
  setValue
}: GoogleSheetsRangePreviewProps) {
  const [selectedRange, setSelectedRange] = useState<{ start: string; end: string } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ row: number; col: string } | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: string } | null>(null);

  // Get column headers - show first 10 for display
  const allColumns = previewData.length > 0 && previewData[0].fields
    ? Object.keys(previewData[0].fields).filter(key => !key.startsWith('_'))
    : [];
  const columns = allColumns.slice(0, 10);
  const hasMoreColumns = allColumns.length > 10;

  // Convert column index to letter (0 = A, 1 = B, etc.)
  const getColumnLetter = (index: number): string => {
    let letter = '';
    let num = index;
    while (num >= 0) {
      letter = String.fromCharCode(65 + (num % 26)) + letter;
      num = Math.floor(num / 26) - 1;
    }
    return letter;
  };

  // Handle cell click to start/end selection
  const handleCellClick = (rowNumber: number, columnName: string) => {
    const colIndex = allColumns.indexOf(columnName);
    const colLetter = getColumnLetter(colIndex);

    if (!isSelecting) {
      // Start selection
      setIsSelecting(true);
      setSelectionStart({ row: rowNumber, col: colLetter });
      setSelectedRange({ start: `${colLetter}${rowNumber}`, end: `${colLetter}${rowNumber}` });
      setHoveredCell({ row: rowNumber, col: colLetter }); // Initialize hover on first click
    } else {
      // End selection
      setIsSelecting(false);
      setHoveredCell(null); // Clear hover state when selection completes
      if (selectionStart) {
        const range = `${selectionStart.col}${selectionStart.row}:${colLetter}${rowNumber}`;
        setSelectedRange({ start: `${selectionStart.col}${selectionStart.row}`, end: `${colLetter}${rowNumber}` });
        setValue('range', range);
      }
    }
  };

  // Check if a cell is in the selected range or hover preview
  const isCellSelected = (rowNumber: number, columnName: string): boolean => {
    const colIndex = allColumns.indexOf(columnName);

    // If we're actively selecting and hovering, show preview range
    if (isSelecting && selectionStart && hoveredCell) {
      const startColIndex = allColumns.findIndex(c => getColumnLetter(allColumns.indexOf(c)) === selectionStart.col);
      const hoverColIndex = allColumns.findIndex(c => getColumnLetter(allColumns.indexOf(c)) === hoveredCell.col);

      const minRow = Math.min(selectionStart.row, hoveredCell.row);
      const maxRow = Math.max(selectionStart.row, hoveredCell.row);
      const minCol = Math.min(startColIndex, hoverColIndex);
      const maxCol = Math.max(startColIndex, hoverColIndex);

      return rowNumber >= minRow && rowNumber <= maxRow && colIndex >= minCol && colIndex <= maxCol;
    }

    // If selection is complete, show final selected range
    if (!isSelecting && selectedRange && selectionStart) {
      // Parse end cell from selectedRange.end (e.g., "B5" -> row: 5, col: "B")
      const endMatch = selectedRange.end.match(/^([A-Z]+)(\d+)$/);
      if (!endMatch) return false;

      const endCol = endMatch[1];
      const endRow = parseInt(endMatch[2], 10);

      const startColIndex = allColumns.findIndex(c => getColumnLetter(allColumns.indexOf(c)) === selectionStart.col);
      const endColIndex = allColumns.findIndex(c => getColumnLetter(allColumns.indexOf(c)) === endCol);

      const minRow = Math.min(selectionStart.row, endRow);
      const maxRow = Math.max(selectionStart.row, endRow);
      const minCol = Math.min(startColIndex, endColIndex);
      const maxCol = Math.max(startColIndex, endColIndex);

      return rowNumber >= minRow && rowNumber <= maxRow && colIndex >= minCol && colIndex <= maxCol;
    }

    return false;
  };

  const handleClearSelection = () => {
    setSelectedRange(null);
    setSelectionStart(null);
    setIsSelecting(false);
    setHoveredCell(null);
    setValue('range', '');
  };

  // Handle cell hover during selection
  const handleCellHover = (rowNumber: number, columnName: string) => {
    if (isSelecting && selectionStart) {
      const colIndex = allColumns.indexOf(columnName);
      const colLetter = getColumnLetter(colIndex);
      setHoveredCell({ row: rowNumber, col: colLetter });
    }
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
            Click cells to select a range to clear. Click once to start, click again to complete the range selection.
          </p>

          <div className="flex items-center gap-3 flex-wrap">
            {loadingPreview && (
              <div className="flex items-center gap-2 text-slate-600">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent"></div>
                <span className="text-sm">Loading preview...</span>
              </div>
            )}

            {selectedRange && (
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-md text-sm">
                <span className="font-mono font-medium">
                  {selectedRange.start === selectedRange.end ? selectedRange.start : `${selectedRange.start}:${selectedRange.end}`}
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

            {isSelecting && (
              <span className="text-xs text-blue-600 font-medium">
                Click another cell to complete the range...
              </span>
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
                  Click cells to select range to clear
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
                        {hasMoreColumns && (
                          <TableHead className="text-xs font-medium text-slate-600 uppercase">
                            +{allColumns.length - 10} more
                          </TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.slice(0, 50).map((row) => (
                        <TableRow
                          key={row.id}
                          className="transition-colors"
                        >
                          <TableCell className="text-xs font-mono text-slate-600 font-medium">
                            {row.rowNumber || row.id}
                          </TableCell>
                          {columns.map((column) => {
                            const isSelected = isCellSelected(row.rowNumber || row.id, column);
                            return (
                              <TableCell
                                key={column}
                                className={`text-xs max-w-[200px] truncate cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'bg-blue-600 text-white hover:bg-blue-700 border border-blue-800'
                                    : 'hover:bg-slate-50'
                                }`}
                                onClick={() => handleCellClick(row.rowNumber || row.id, column)}
                                onMouseEnter={() => handleCellHover(row.rowNumber || row.id, column)}
                              >
                                {row.fields[column] !== null && row.fields[column] !== undefined
                                  ? String(row.fields[column])
                                  : ''}
                              </TableCell>
                            );
                          })}
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
    </>
  );
}
