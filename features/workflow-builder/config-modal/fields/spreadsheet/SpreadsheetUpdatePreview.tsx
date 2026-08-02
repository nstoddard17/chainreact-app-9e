"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import type { UpdatePreview } from "../../guided/updatePreviewModel";

/**
 * "Changes we'll make" (SPREADSHEET-GUIDED-CONFIG-S3).
 *
 * The append preview is titled "The row we'd add", which would be plainly
 * wrong for an edit: no row is being added, and most of the row is already
 * in the customer's spreadsheet. Two deliberate absences follow from that,
 * both from the approved plan:
 *
 *   - **No "before" column and no merged result.** The builder has never
 *     read the target row — there is no resolver that fetches an arbitrary
 *     worksheet row — so any current value shown here would be invented,
 *     and an invented "before" reads as confirmation that the right row was
 *     found.
 *   - **No sample values.** An untested reference is shown AS the
 *     reference, exactly as the append preview does.
 *
 * The unchanged COUNT is shown rather than a list, because "everything else
 * stays as it is" is the reassurance the user needs and twenty untouched
 * column names would bury the three that change.
 */

export interface SpreadsheetUpdatePreviewProps {
  readonly fieldName: string;
  readonly preview: UpdatePreview;
}

export function SpreadsheetUpdatePreview({
  fieldName,
  preview,
}: SpreadsheetUpdatePreviewProps) {
  if (preview.entries.length === 0) return null;

  return (
    <div
      className="flex min-w-0 flex-col gap-2 rounded-md border bg-muted/30 p-3"
      data-testid={`spreadsheet-preview-${fieldName}`}
      data-provenance={preview.provenance}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          Changes we&rsquo;ll make
        </p>
        <p
          className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground"
          data-testid={`spreadsheet-preview-${fieldName}-caption`}
        >
          {preview.caption}
        </p>
      </div>

      <dl className="flex min-w-0 flex-col gap-1 border-l-2 border-input pl-2">
        {preview.entries.map((entry, i) => (
          <div
            key={`${entry.kind}-${entry.column}-${i}`}
            className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-xs"
            data-testid={`spreadsheet-preview-${fieldName}-entry-${i}`}
            data-entry-kind={entry.kind}
            data-cell-state={entry.state}
          >
            <dt className="min-w-0 break-words font-medium">{entry.column}</dt>
            <dd
              className={`min-w-0 break-all ${
                entry.kind === "clear"
                  ? "italic text-muted-foreground"
                  : entry.state === "broken"
                    ? "font-mono text-destructive"
                    : entry.state === "untested"
                      ? "font-mono text-amber-700 dark:text-amber-400"
                      : "font-mono text-muted-foreground"
              }`}
            >
              {/* Stated in words. A cleared cell has no value to show, and
                  rendering nothing would be indistinguishable from a bug. */}
              {entry.kind === "clear" ? "will be emptied" : entry.display}
            </dd>
          </div>
        ))}
      </dl>

      {preview.unchangedCount > 0 ? (
        <p
          className="text-[11px] text-muted-foreground"
          data-testid={`spreadsheet-preview-${fieldName}-unchanged`}
        >
          {preview.unchangedCount === 1
            ? "1 other column keeps whatever is already in it."
            : `${preview.unchangedCount} other columns keep whatever is already in them.`}
        </p>
      ) : null}

      {preview.brokenReferences.length > 0 ? (
        <p
          role="alert"
          className="flex min-w-0 items-start gap-1.5 break-words text-[11px] text-destructive"
          data-testid={`spreadsheet-preview-${fieldName}-broken`}
        >
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">
            {preview.brokenReferences.join(", ")} points at a step that
            isn&rsquo;t in this workflow any more. Pick a new value for that
            column.
          </span>
        </p>
      ) : null}
    </div>
  );
}
