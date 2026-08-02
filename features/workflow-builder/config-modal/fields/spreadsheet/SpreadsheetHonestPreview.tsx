"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import type { RowPreview } from "../../guided/rowPreviewModel";

/**
 * "The row we'd add" (SHEETS-GUIDED-CONFIG-1, D6).
 *
 * Renders the outcome of `buildRowPreview`, whose whole job is deciding
 * what may truthfully be shown. The caption always states the
 * provenance of what is on screen — real captured data, partially
 * tested, untested, or pointing at a step that is gone — so the preview
 * can never be mistaken for a guarantee about the next run.
 *
 * Two deliberate absences, both from the approved plan:
 *   - No neighbouring sheet rows and no predicted row number. The system
 *     cannot know either before the write, so claiming them would be a
 *     fabrication.
 *   - No sample/example values. An untested reference is shown AS the
 *     reference.
 */

export interface SpreadsheetHonestPreviewProps {
  readonly fieldName: string;
  readonly preview: RowPreview;
}

export function SpreadsheetHonestPreview({
  fieldName,
  preview,
}: SpreadsheetHonestPreviewProps) {
  const populated = preview.cells.filter((c) => c.state !== "blank");
  if (populated.length === 0) return null;

  return (
    <div
      className="flex min-w-0 flex-col gap-2 rounded-md border bg-muted/30 p-3"
      data-testid={`spreadsheet-preview-${fieldName}`}
      data-provenance={preview.provenance}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          The row we&rsquo;d add
        </p>
        <p
          className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground"
          data-testid={`spreadsheet-preview-${fieldName}-caption`}
        >
          {preview.caption}
        </p>
      </div>

      <dl className="flex flex-col gap-0.5 border-l-2 border-input pl-2">
        {preview.cells.map((cell, i) =>
          cell.state === "blank" ? null : (
            <div
              key={i}
              /* SPREADSHEET-GUIDED-CONFIG-S3 — the name/value pair WRAPS
                 rather than sitting on one line. Side by side, a
                 sentence-length column name and its value cannot both fit in
                 the 331px overlay config sheet. Deliberately no breakpoint
                 class: this panel's width is the drawer's, not the
                 viewport's (responsive rule §2), so `flex-wrap` — which
                 reacts to the space actually available — is the only correct
                 instrument here. */
              className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-xs"
              data-testid={`spreadsheet-preview-${fieldName}-cell-${i}`}
              data-cell-state={cell.state}
            >
              {/* Was `shrink-0`, which meant a long worksheet column name
                  burst straight out of the preview card — measured at every
                  width from 360 to 1600 by the guided panel's first sweep.
                  The name wraps instead; it is never abbreviated away,
                  because it is what tells the user which cell they are
                  looking at. */}
              <dt className="min-w-0 break-words font-medium">
                {cell.columnName}
              </dt>
              <dd
                className={`min-w-0 break-all font-mono ${
                  cell.state === "broken"
                    ? "text-destructive"
                    : cell.state === "untested"
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-muted-foreground"
                }`}
              >
                {cell.display}
              </dd>
            </div>
          ),
        )}
      </dl>

      {/* Blank columns are a legitimate finished state, so they are stated
          as a fact rather than flagged as a problem. */}
      {preview.cells.some((c) => c.state === "blank") ? (
        <p className="text-[11px] text-muted-foreground">
          Columns you left empty stay blank in the sheet.
        </p>
      ) : null}

      {preview.brokenReferences.length > 0 ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-[11px] text-destructive"
          data-testid={`spreadsheet-preview-${fieldName}-broken`}
        >
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
          <span>
            {preview.brokenReferences.join(", ")} points at a step that
            isn&rsquo;t in this workflow any more. Pick a new value for that
            column.
          </span>
        </p>
      ) : null}
    </div>
  );
}
