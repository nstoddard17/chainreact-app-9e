"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SpreadsheetCellInput } from "./SpreadsheetCellInput";
import type { SpreadsheetColumn } from "./SpreadsheetRowsField";
import type { VariableSource } from "../../../hooks/useUpstreamVariables";

/**
 * "Several rows" editor (SPREADSHEET-CONFIG-REDESIGN-1): each row is a
 * card with one input per detected column (the config rail is narrow, so
 * row cards beat a wide table). Add row / Remove row; new rows start
 * blank. Blank fields keep those cells empty.
 *
 * Only used when columns WERE detected — the no-columns fallback for
 * several-rows mode is the manual column-name/value row builder the
 * composite field renders instead.
 */

export interface SpreadsheetBatchRowsEditorProps {
  fieldName: string;
  columns: readonly SpreadsheetColumn[];
  /** grid[row][columnIndex] — aligned to `columns`. */
  grid: ReadonlyArray<readonly string[]>;
  onCellChange: (rowIndex: number, columnIndex: number, next: string) => void;
  onAddRow: () => void;
  onRemoveRow: (rowIndex: number) => void;
  /** UI cap; the runtime schema stays authoritative. */
  maxRows: number;
  disabled?: boolean | undefined;
  sources: readonly VariableSource[];
  latestValuesBySource?: Readonly<Record<string, unknown>> | undefined;
}

export function SpreadsheetBatchRowsEditor({
  fieldName,
  columns,
  grid,
  onCellChange,
  onAddRow,
  onRemoveRow,
  maxRows,
  disabled,
  sources,
  latestValuesBySource,
}: SpreadsheetBatchRowsEditorProps) {
  const atCap = grid.length >= maxRows;

  return (
    <div
      className="flex flex-col gap-3"
      data-testid={`spreadsheet-batch-rows-${fieldName}`}
    >
      {grid.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">
          No rows yet — add your first row below.
        </p>
      ) : null}
      {grid.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="flex flex-col gap-2 rounded-md border p-3"
          data-testid={`spreadsheet-batch-rows-${fieldName}-row-${rowIndex}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Row {rowIndex + 1}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove row ${rowIndex + 1}`}
              onClick={() => onRemoveRow(rowIndex)}
              disabled={disabled}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          {columns.map((column, columnIndex) => (
            <SpreadsheetCellInput
              key={`${columnIndex}-${column.name}`}
              id={`field-${fieldName}-row-${rowIndex}-cell-${columnIndex}`}
              label={column.name}
              hint={column.hint}
              value={row[columnIndex] ?? ""}
              onChange={(next) => onCellChange(rowIndex, columnIndex, next)}
              disabled={disabled}
              sources={sources}
              latestValuesBySource={latestValuesBySource}
              ariaLabel={`Row ${rowIndex + 1} ${column.name}`}
            />
          ))}
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddRow}
          disabled={disabled || atCap}
          data-testid={`spreadsheet-batch-rows-${fieldName}-add-row`}
        >
          <Plus className="h-4 w-4" />
          Add row{atCap ? ` (max ${maxRows})` : ""}
        </Button>
      </div>
    </div>
  );
}
