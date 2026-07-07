"use client";

import * as React from "react";
import type { SpreadsheetColumn } from "./SpreadsheetRowsField";

/**
 * Row preview (SPREADSHEET-CONFIG-REDESIGN-1): shows how the row(s) will
 * look before saving, as a compact column → value list. `{{...}}` tokens
 * render verbatim (they resolve at run time — the preview never fakes a
 * resolved value). Batch mode shows the row count plus the first few
 * rows as samples.
 *
 * Renders nothing until at least one cell has content.
 */

const MAX_SAMPLE_ROWS = 3;

export interface SpreadsheetPreviewProps {
  fieldName: string;
  /** Detected columns; empty in manual one-row mode (positional labels used). */
  columns: readonly SpreadsheetColumn[];
  /** One entry in "one row" mode; N entries in "several rows" mode. */
  rows: ReadonlyArray<readonly string[]>;
  mode: "one" | "several";
}

function hasContent(row: readonly string[]): boolean {
  return row.some((cell) => cell.trim().length > 0);
}

export function SpreadsheetPreview({
  fieldName,
  columns,
  rows,
  mode,
}: SpreadsheetPreviewProps) {
  const filledRows = rows.filter(hasContent);
  if (filledRows.length === 0) return null;

  const sampleRows = filledRows.slice(0, MAX_SAMPLE_ROWS);
  const hiddenCount = filledRows.length - sampleRows.length;

  return (
    <div
      className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3"
      data-testid={`spreadsheet-preview-${fieldName}`}
    >
      <p className="text-xs font-medium text-muted-foreground">
        {mode === "one"
          ? "How your row will look"
          : filledRows.length === 1
            ? "1 row will be added"
            : `${filledRows.length} rows will be added`}
      </p>
      {sampleRows.map((row, rowIndex) => (
        <dl
          key={rowIndex}
          className="flex flex-col gap-0.5 border-l-2 border-input pl-2"
          data-testid={`spreadsheet-preview-${fieldName}-row-${rowIndex}`}
        >
          {row.map((cell, i) => {
            if (cell.trim().length === 0) return null;
            const label = columns[i]?.name ?? `Column ${i + 1}`;
            return (
              <div key={i} className="flex items-baseline gap-2 text-xs">
                <dt className="shrink-0 font-medium">{label}</dt>
                <dd className="truncate font-mono text-muted-foreground">
                  {cell}
                </dd>
              </div>
            );
          })}
        </dl>
      ))}
      {hiddenCount > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          …and {hiddenCount} more {hiddenCount === 1 ? "row" : "rows"}.
        </p>
      ) : null}
    </div>
  );
}
