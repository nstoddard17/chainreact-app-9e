"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { SpreadsheetUpdateCell } from "./SpreadsheetUpdateCell";
import { SpreadsheetUpdatePreview } from "./SpreadsheetUpdatePreview";
import { buildUpdatePreview } from "../../guided/updatePreviewModel";
import {
  classifyColumns,
  incompleteValueColumns,
  isLegacyPreservedNull,
  recordToUpdateCells,
  staleRecordEntries,
  updateCellsToRecord,
  type DetectedColumn,
  type UpdateCell,
  type UpdateCellState,
} from "./_updateModel";
import type { VariableSource } from "../../../hooks/useUpstreamVariables";

/**
 * The record-shaped UPDATE editor (SPREADSHEET-GUIDED-CONFIG-S3).
 *
 * Shows EVERY detected worksheet column, each with its own three-state
 * control, rather than only the columns a saved config already mentions.
 * The central question this step answers is "which columns change and which
 * stay as they are?", and a list that only shows the ones already chosen
 * cannot answer it — the user would have to remember what else is in their
 * sheet.
 *
 * Nothing here is stateful. The cells are DERIVED from the saved record on
 * every render and committed straight back, so:
 *
 *   - opening the step never writes, and therefore never dirties the draft;
 *   - key ORDER carries no meaning (the handler resolves each key
 *     independently), so a resolver returning columns in a different order
 *     cannot change what a saved configuration does;
 *   - a saved value the user has not touched is re-emitted verbatim (see
 *     `UpdateCell.saved`), so editing one column cannot silently rewrite
 *     another.
 *
 * Two states are refusals rather than best guesses, both because the
 * alternative would quietly damage a customer's spreadsheet:
 *
 *   - **Columns could not be loaded while a record is saved.** Rendering
 *     empty controls over keyed data would show every column as "leave
 *     unchanged", and the next click would commit that lie. The editor says
 *     so and edits nothing.
 *   - **A duplicate column heading.** Handled per column in
 *     `SpreadsheetUpdateCell`.
 */

export interface SpreadsheetUpdateEditorProps {
  readonly fieldName: string;
  readonly columns: readonly DetectedColumn[];
  /** The saved `Record<column, value>` (or anything else, defensively). */
  readonly value: unknown;
  readonly onChange: (next: Record<string, unknown> | undefined) => void;
  /** True when the columns resolver has not produced a usable list. */
  readonly columnsUnavailable: boolean;
  readonly disabled?: boolean | undefined;
  readonly sources: readonly VariableSource[];
  readonly latestValuesBySource?: Readonly<Record<string, unknown>> | undefined;
}

export function SpreadsheetUpdateEditor({
  fieldName,
  columns,
  value,
  onChange,
  columnsUnavailable,
  disabled,
  sources,
  latestValuesBySource,
}: SpreadsheetUpdateEditorProps) {
  const classified = React.useMemo(() => classifyColumns(columns), [columns]);
  const columnNames = React.useMemo(
    () => classified.map((c) => c.value),
    [classified],
  );

  /**
   * Columns the user has put into "Set to a value" but not yet given a
   * value for.
   *
   * This is TRANSIENT UI INTENT, and it is deliberately not persisted. The
   * saved record has exactly three meanings — key absent, key `""`, key
   * with content — and "I intend to set a value but have not chosen it" is
   * none of them. Writing it as `""` would be the silent downgrade to "Set
   * to blank" that erases a customer's cell because someone stopped
   * half-way; inventing a fourth representation would author a shape the
   * runtime schema does not define.
   *
   * So the config keeps meaning "leave this column alone" — the
   * non-destructive reading — while the editor remembers the intent, shows
   * the value input, and says plainly that the choice is unfinished.
   * Closing the panel without answering therefore changes nothing, which is
   * the correct outcome for a question that was never answered.
   *
   * Keyed by raw column name rather than index so a resolver returning
   * columns in a different order cannot move the mark to another column.
   */
  const [pendingValueColumns, setPendingValueColumns] = React.useState<
    ReadonlySet<string>
  >(() => new Set());

  const cells = React.useMemo(() => {
    const hydrated = recordToUpdateCells(value, columnNames);
    return hydrated.map((cell) =>
      cell.state === "unchanged" && pendingValueColumns.has(cell.column)
        ? { column: cell.column, state: "value" as const, value: "" }
        : cell,
    );
  }, [value, columnNames, pendingValueColumns]);
  const stale = React.useMemo(
    () => staleRecordEntries(value, columnNames),
    [value, columnNames],
  );
  const staleKeys = Object.keys(stale);

  const preview = React.useMemo(
    () => buildUpdatePreview({ cells, sources, latestValuesBySource }),
    [cells, sources, latestValuesBySource],
  );
  const incomplete = React.useMemo(
    () => incompleteValueColumns(cells),
    [cells],
  );

  function commit(next: readonly UpdateCell[]): void {
    // A column still sitting on the unfinished "Set to a value" choice
    // contributes NOTHING to the saved config. Committing it would write
    // `""`, which the handler reads as "erase this cell" — a destructive
    // write nobody asked for.
    const persistable = next.map((cell) =>
      cell.state === "value" && cell.value.trim().length === 0
        ? { column: cell.column, state: "unchanged" as const, value: "" }
        : cell,
    );
    onChange(updateCellsToRecord(persistable, stale));
  }

  function markPending(column: string, pending: boolean): void {
    setPendingValueColumns((prev) => {
      const next = new Set(prev);
      if (pending) next.add(column);
      else next.delete(column);
      return next;
    });
  }

  function handleStateChange(index: number, next: UpdateCellState): void {
    const current = cells[index];
    if (!current) return;

    // "Set to a value" with nothing typed yet is remembered locally and
    // NOT committed (see `pendingValueColumns`). Everything else is a
    // complete answer and commits immediately.
    const stillEmpty = next === "value" && current.value.trim().length === 0;
    markPending(current.column, stillEmpty);

    // The user has now expressed an intent for this column, so the saved
    // original stops standing in for it.
    const replacement: UpdateCell = stillEmpty
      ? { column: current.column, state: "unchanged", value: "" }
      : {
          column: current.column,
          state: next,
          value: next === "value" ? current.value : "",
        };
    commit(cells.map((cell, i) => (i === index ? replacement : cell)));
  }

  function handleValueChange(index: number, next: string): void {
    const current = cells[index];
    if (!current) return;
    // Emptying the box again returns the column to "leave unchanged" in the
    // saved config while the input stays on screen — the intent is still
    // the user's, it is just unfinished again.
    const stillEmpty = next.trim().length === 0;
    markPending(current.column, stillEmpty);
    const replacement: UpdateCell = stillEmpty
      ? { column: current.column, state: "unchanged", value: "" }
      : { column: current.column, state: "value", value: next };
    commit(cells.map((cell, i) => (i === index ? replacement : cell)));
  }

  function handleRemoveStaleKey(key: string): void {
    const { [key]: _removed, ...rest } = stale;
    onChange(updateCellsToRecord(cells, rest));
  }

  // A saved record with no column list is the one case where drawing the
  // controls would be actively harmful (see the module doc).
  const savedRecordWithoutColumns =
    columnsUnavailable &&
    columns.length === 0 &&
    (staleKeys.length > 0 || cells.length > 0);

  if (savedRecordWithoutColumns) {
    return (
      <div
        className="flex min-w-0 flex-col gap-2"
        data-testid={`spreadsheet-update-${fieldName}`}
      >
        <p
          role="status"
          data-testid={`spreadsheet-update-${fieldName}-record-needs-columns`}
          className="rounded-md border border-dashed p-3 text-xs text-muted-foreground"
        >
          This step already has changes saved against your column names. We
          can&rsquo;t show them until the column list loads, so nothing is
          editable here yet — your saved changes are untouched.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex min-w-0 flex-col gap-3"
      data-testid={`spreadsheet-update-${fieldName}`}
    >
      <p className="text-xs text-muted-foreground">
        These are the columns in your worksheet. Choose what should happen to
        each one. Anything left on &ldquo;Leave unchanged&rdquo; keeps
        whatever is already in that cell.
      </p>

      {columns.length === 0 && !columnsUnavailable ? (
        <p
          role="status"
          data-testid={`spreadsheet-update-${fieldName}-no-columns`}
          className="rounded-md border border-dashed p-3 text-xs text-muted-foreground"
        >
          We couldn&rsquo;t detect any column names in this worksheet. Add
          headings to the first row in Excel and reopen this step.
        </p>
      ) : null}

      {classified.map((column, index) => {
        const cell = cells[index];
        return (
          <SpreadsheetUpdateCell
            key={`${index}-${column.value}`}
            fieldName={fieldName}
            index={index}
            column={column}
            state={cell?.state ?? "unchanged"}
            value={cell?.value ?? ""}
            legacyPreserved={cell !== undefined && isLegacyPreservedNull(cell)}
            onStateChange={(next) => handleStateChange(index, next)}
            onValueChange={(next) => handleValueChange(index, next)}
            disabled={disabled}
            sources={sources}
            latestValuesBySource={latestValuesBySource}
          />
        );
      })}

      {incomplete.length > 0 ? (
        /*
          The half-finished choice, named at the point it was made rather
          than only in a banner at the top of the panel. Both real options
          are offered in words, because the whole risk here is a product
          quietly picking one of them.
        */
        <p
          role="alert"
          data-testid={`spreadsheet-update-${fieldName}-incomplete`}
          className="flex min-w-0 items-start gap-1.5 break-words rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] text-amber-800 dark:text-amber-300"
        >
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">
            {incomplete.length === 1
              ? `Choose a value for “${incomplete[0]}”, or set it to blank. Until you do, that column is left exactly as it is.`
              : `Choose a value for ${incomplete
                  .map((c) => `“${c}”`)
                  .join(", ")}, or set them to blank. Until you do, those columns are left exactly as they are.`}
          </span>
        </p>
      ) : null}

      {staleKeys.length > 0 ? (
        /*
          A saved column that is no longer in the worksheet. It is PRESERVED,
          not deleted: the runtime handler fails loudly on a key it cannot
          resolve, so silently removing it would turn a visible, fixable
          problem into a workflow that quietly stopped doing what its author
          asked. Readiness blocks on it for the same reason.
        */
        <div
          className="flex min-w-0 flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3"
          data-testid={`spreadsheet-update-${fieldName}-stale`}
          role="status"
        >
          <p className="flex min-w-0 items-start gap-1.5 break-words text-[11px] text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">
              {staleKeys.length === 1
                ? "This step is set to change a column that isn't in the worksheet any more. The run will fail until it comes back or you remove it."
                : "This step is set to change columns that aren't in the worksheet any more. The run will fail until they come back or you remove them."}
            </span>
          </p>
          <ul className="flex min-w-0 flex-col gap-1.5">
            {staleKeys.map((key) => (
              <li
                key={key}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-[11px]"
                data-testid={`spreadsheet-update-${fieldName}-stale-${key}`}
              >
                <span className="min-w-0 break-words font-medium">{key}</span>
                {/* The VISIBLE label stays short and the column name lives
                    in the accessible name instead. A worksheet heading can
                    be a whole sentence, and a `shrink-0` button carrying
                    one burst out of this row at every width from 360 to
                    1600 — measured by the guided panel's responsive sweep.
                    A screen reader still hears which column it removes,
                    and the name is right beside the button visually. */}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleRemoveStaleKey(key)}
                  aria-label={`Remove ${key}`}
                  className="shrink-0 rounded border border-input px-2 py-1 text-[11px] hover:bg-muted/40"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <SpreadsheetUpdatePreview fieldName={fieldName} preview={preview} />

      <p className="text-[11px] text-muted-foreground">
        Values can come from earlier steps. Use the {"{x}"} button next to any
        value to insert data from your trigger or a previous step.
      </p>
    </div>
  );
}
