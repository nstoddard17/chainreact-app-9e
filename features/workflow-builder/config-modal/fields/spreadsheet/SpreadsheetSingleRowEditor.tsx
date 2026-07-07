"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SpreadsheetCellInput } from "./SpreadsheetCellInput";
import type { SpreadsheetColumn } from "./SpreadsheetRowsField";
import type { VariableSource } from "../../../hooks/useUpstreamVariables";

/**
 * "One row" editor (SPREADSHEET-CONFIG-REDESIGN-1): one input per
 * detected column, in worksheet column order. Leaving a field blank
 * keeps that cell empty — blanks between filled cells are preserved so
 * later columns stay aligned.
 *
 * Manual mode (no columns detected): the author builds the row cell by
 * cell in column order ("1st column", "2nd column", …) with add/remove
 * affordances. Same save shape; the labels are positional because the
 * sheet offered no header names — never invented ones.
 */

export interface SpreadsheetSingleRowEditorProps {
  fieldName: string;
  /** Detected columns; empty in manual mode. */
  columns: readonly SpreadsheetColumn[];
  /** Current cell values, aligned by index to columns (or positions in manual mode). */
  cells: readonly string[];
  onCellChange: (index: number, next: string) => void;
  /** Manual mode only — append an empty cell. */
  onAddCell?: () => void;
  /** Manual mode only — remove the cell at index. */
  onRemoveCell?: (index: number) => void;
  disabled?: boolean | undefined;
  sources: readonly VariableSource[];
  latestValuesBySource?: Readonly<Record<string, unknown>> | undefined;
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

export function SpreadsheetSingleRowEditor({
  fieldName,
  columns,
  cells,
  onCellChange,
  onAddCell,
  onRemoveCell,
  disabled,
  sources,
  latestValuesBySource,
}: SpreadsheetSingleRowEditorProps) {
  const manual = columns.length === 0;

  return (
    <div
      className="flex flex-col gap-3"
      data-testid={`spreadsheet-single-row-${fieldName}`}
    >
      {manual ? (
        <>
          {cells.map((cell, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <SpreadsheetCellInput
                  id={`field-${fieldName}-cell-${i}`}
                  label={`${ordinal(i + 1)} column`}
                  value={cell}
                  onChange={(next) => onCellChange(i, next)}
                  disabled={disabled}
                  sources={sources}
                  latestValuesBySource={latestValuesBySource}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${ordinal(i + 1)} column value`}
                onClick={() => onRemoveCell?.(i)}
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onAddCell?.()}
              disabled={disabled}
              data-testid={`spreadsheet-single-row-${fieldName}-add-cell`}
            >
              <Plus className="h-4 w-4" />
              Add a value
            </Button>
          </div>
        </>
      ) : (
        columns.map((column, i) => (
          <SpreadsheetCellInput
            key={`${i}-${column.name}`}
            id={`field-${fieldName}-cell-${i}`}
            label={column.name}
            hint={column.hint}
            value={cells[i] ?? ""}
            onChange={(next) => onCellChange(i, next)}
            disabled={disabled}
            sources={sources}
            latestValuesBySource={latestValuesBySource}
          />
        ))
      )}
    </div>
  );
}
