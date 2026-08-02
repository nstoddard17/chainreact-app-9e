"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FieldMeta } from "@/contracts/actionMeta";
import { normalizeDependsOn } from "@/contracts/actionMeta";
import { useOptionsSource } from "@/features/workflow-builder/hooks/useOptionsSource";
import { useGraphSlice } from "../../../state/graphSlice";
import { useConfigSlice } from "../../../state/configSlice";
import { useActiveNodeUpstreamVariables } from "../../../hooks/useActiveNodeUpstreamVariables";
import { FieldShell } from "../FieldShell";
import { KeyValueListField } from "../KeyValueListField";
import type { FieldRendererProps } from "../types";
import { SpreadsheetRowModeToggle, type SpreadsheetRowMode } from "./SpreadsheetRowModeToggle";
import { SpreadsheetSingleRowEditor } from "./SpreadsheetSingleRowEditor";
import { SpreadsheetBatchRowsEditor } from "./SpreadsheetBatchRowsEditor";
import { SpreadsheetPreview } from "./SpreadsheetPreview";
import { SpreadsheetSuggestions } from "./SpreadsheetSuggestions";
import { SpreadsheetHonestPreview } from "./SpreadsheetHonestPreview";
import { buildRowPreview } from "../../guided/rowPreviewModel";
import {
  suggestMappings,
  type MappingSuggestion,
} from "../../guided/mappingSuggestions";
import {
  batchRowsToGrid,
  cellsToPositionalValues,
  cellsToRecordValues,
  dropEmptyBatchRecords,
  gridToBatchRows,
  isRecordRowValue,
  positionalValuesToCells,
  recordValuesToCells,
} from "./_serialize";

/**
 * `spreadsheet-rows` composite field renderer
 * (SPREADSHEET-CONFIG-REDESIGN-1) — the column-aware row editor for
 * spreadsheet append actions. First consumer: `microsoft-excel:add_row`.
 *
 * One editor owns BOTH halves of the action's either-or save contract:
 *   - "One row"      → THIS field's value, a positional `string[]`
 *     (cells in column order; in-between blanks kept as "").
 *   - "Several rows" → the sibling named by `field.batchRowsField`, an
 *     `Array<Record<columnHeader, cellValue>>` written via
 *     `onChangeField` (the sibling declares `renderedBy` so it never
 *     renders a duplicate editor).
 * Switching modes clears the other shape, so exactly one is ever
 * present — matching the runtime schema's XOR refine.
 *
 * Columns are REAL provider data loaded from `field.optionsSource`
 * (`microsoft-excel:worksheet_columns` — the sheet's actual first-row
 * headers). When no columns can be detected the editor says so honestly
 * and falls back to manual entry (positional cells for one row; a
 * column-name/value row builder for several) — it never invents
 * column names.
 *
 * All local editor state lives in the destination-keyed body component:
 * picking a different workbook/worksheet remounts it (and SchemaForm's
 * dependsOn cascade clears both saved shapes), so stale cells can never
 * leak across destinations.
 */

/** One detected column: real header name + honest position hint. */
export interface SpreadsheetColumn {
  readonly name: string;
  /** e.g. "Column B" — from the resolver's description. */
  readonly hint?: string | undefined;
}

/** Mirrors the runtime schema's batch cap (`rows` .max(1000)). UI hint only. */
const MAX_BATCH_ROWS = 1000;

export const SpreadsheetRowsField: React.FC<FieldRendererProps> = (props) => {
  const { field, error, enabled, parentLabel, deps } = props;
  const controlId = `field-${field.name}`;

  const dependsOnNames = normalizeDependsOn(field.dependsOn);
  const gatedByParent = enabled === false && dependsOnNames.length > 0;

  // Remount the body (all local editor state) when the destination
  // changes — deps carry the parent values (workbook + worksheet).
  const destinationKey = JSON.stringify(deps ?? {});

  return (
    <FieldShell
      controlId={controlId}
      label={field.label}
      required={field.required}
      description={field.description}
      error={error}
    >
      {gatedByParent ? (
        <p
          className="rounded-md border border-dashed p-3 text-xs text-muted-foreground"
          data-testid={`spreadsheet-rows-${field.name}-parent-missing`}
        >
          {`Select ${parentLabel ?? dependsOnNames.join(", ")} first.`}
        </p>
      ) : (
        <SpreadsheetRowsBody key={destinationKey} {...props} />
      )}
    </FieldShell>
  );
};

function SpreadsheetRowsBody({
  field,
  value,
  onChange,
  disabled,
  deps,
  formValues,
  onChangeField,
}: FieldRendererProps) {
  const batchFieldName = field.batchRowsField;
  const batchValue = batchFieldName ? formValues?.[batchFieldName] : undefined;

  const workflowId = useGraphSlice((s) => s.workflowId) ?? undefined;
  const nodeId = useConfigSlice((s) => s.activeNodeId) ?? undefined;
  const { sources, latestValuesBySource } = useActiveNodeUpstreamVariables();

  const { state: columnsState, refetch } = useOptionsSource({
    source: field.optionsSource ?? null,
    ...(deps !== undefined && { deps }),
    ...(workflowId !== undefined && { workflowId }),
    ...(nodeId !== undefined && { nodeId }),
  });

  const columns: readonly SpreadsheetColumn[] = React.useMemo(
    () =>
      columnsState.status === "ready"
        ? columnsState.items.map((item) => ({
            name: item.label,
            hint: item.description,
          }))
        : [],
    [columnsState],
  );
  const columnNames = React.useMemo(
    () => columns.map((c) => c.name),
    [columns],
  );

  // Mode: hydrate from whichever save shape the config already carries.
  const [mode, setMode] = React.useState<SpreadsheetRowMode>(() =>
    Array.isArray(batchValue) && batchValue.length > 0 ? "several" : "one",
  );

  // ── One-row mode ───────────────────────────────────────────────────────────
  // The saved value may use either representation the action's schema
  // accepts: a POSITIONAL array, or a record KEYED BY COLUMN NAME (Excel
  // add_table_row allows both, and the handler treats them differently —
  // positional is written verbatim, a record is aligned by name). The
  // editor therefore round-trips whichever one it was given, and never
  // converts between them. Converting would change which column each
  // value lands in.
  const valueIsRecord = isRecordRowValue(value);

  // Manual mode keeps an explicit cell count so "Add a value" can show a
  // new blank input (the committed shape trims trailing blanks).
  const hydratedCells = Array.isArray(value) ? value.length : 0;
  const [manualCellCount, setManualCellCount] = React.useState(() =>
    Math.max(1, hydratedCells),
  );
  const cellCount = columns.length > 0 ? columns.length : manualCellCount;

  // A record can only be laid out against known column names. Until they
  // load, rendering positional blanks would hide real saved values behind
  // empty inputs — and the next keystroke would commit over them.
  const recordNeedsColumns = valueIsRecord && columns.length === 0;

  const cells = valueIsRecord
    ? recordValuesToCells(value, columnNames)
    : positionalValuesToCells(value, cellCount);

  function commitCells(next: readonly string[]): void {
    onChange(
      valueIsRecord
        ? cellsToRecordValues(next, columnNames)
        : cellsToPositionalValues(next),
    );
  }
  function handleCellChange(index: number, nextCell: string): void {
    const next = [...cells];
    next[index] = nextCell;
    commitCells(next);
  }
  function handleAddCell(): void {
    setManualCellCount((n) => n + 1);
  }
  function handleRemoveCell(index: number): void {
    const next = cells.filter((_, i) => i !== index);
    setManualCellCount((n) => Math.max(1, n - 1));
    commitCells(next);
  }

  // ── Name-matched suggestions (SHEETS-GUIDED-CONFIG-1, D3) ─────────────────
  // Candidates only. Nothing is written until the user accepts one, and a
  // column that already holds a value is never proposed for.
  const suggestions = React.useMemo(
    () =>
      columnNames.length > 0
        ? suggestMappings({ columns: columnNames, cells, sources })
        : [],
    [columnNames, cells, sources],
  );

  function acceptSuggestion(suggestion: MappingSuggestion): void {
    const next = [...cells];
    next[suggestion.columnIndex] = suggestion.token;
    commitCells(next);
  }
  function acceptAllSuggestions(): void {
    const next = [...cells];
    for (const suggestion of suggestions) {
      next[suggestion.columnIndex] = suggestion.token;
    }
    commitCells(next);
  }

  // ── Honest row preview (D6) — resolves ONLY from captured run data ────────
  const rowPreview = React.useMemo(
    () =>
      buildRowPreview({
        columns: columnNames,
        cells,
        sources,
        latestValuesBySource,
      }),
    [columnNames, cells, sources, latestValuesBySource],
  );

  // ── Several-rows mode (local grid; committed value mirrors it) ─────────────
  // Local state so an added-but-still-blank row stays visible (blank rows
  // are omitted from the committed shape). Hydrated once per destination
  // when the columns arrive (the body remounts per destination).
  const [grid, setGrid] = React.useState<string[][]>([]);
  const gridHydratedRef = React.useRef(false);
  React.useEffect(() => {
    if (gridHydratedRef.current) return;
    if (columns.length === 0) return;
    gridHydratedRef.current = true;
    if (Array.isArray(batchValue) && batchValue.length > 0) {
      setGrid(batchRowsToGrid(columnNames, batchValue));
    }
    // batchValue/columnNames intentionally read once at hydration time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns.length]);

  function commitGrid(nextGrid: string[][]): void {
    setGrid(nextGrid);
    if (!batchFieldName || !onChangeField) return;
    onChangeField(batchFieldName, gridToBatchRows(columnNames, nextGrid));
  }
  function handleGridCellChange(
    rowIndex: number,
    columnIndex: number,
    nextCell: string,
  ): void {
    const nextGrid = grid.map((row, r) =>
      r === rowIndex
        ? row.map((cell, c) => (c === columnIndex ? nextCell : cell))
        : row,
    );
    commitGrid(nextGrid);
  }
  function handleAddRow(): void {
    commitGrid([...grid, columnNames.map(() => "")]);
  }
  function handleRemoveRow(rowIndex: number): void {
    commitGrid(grid.filter((_, r) => r !== rowIndex));
  }

  // ── Mode switching — exactly one save shape is ever present ────────────────
  function handleModeChange(nextMode: SpreadsheetRowMode): void {
    setMode(nextMode);
    if (nextMode === "one") {
      if (batchFieldName && onChangeField) {
        onChangeField(batchFieldName, undefined);
      }
      onChange(cellsToPositionalValues(cells));
    } else {
      onChange(undefined);
      if (batchFieldName && onChangeField) {
        onChangeField(batchFieldName, gridToBatchRows(columnNames, grid));
      }
    }
  }

  // Manual batch fallback (no columns detected) reuses the visual
  // column-name/value row builder; empty records are dropped so the
  // committed value always satisfies the runtime schema.
  const manualBatchFieldMeta: FieldMeta = React.useMemo(
    () => ({
      name: batchFieldName ?? `${field.name}_rows`,
      label: "Rows to add",
      description:
        "For each row, type the column name exactly as it appears in the first row of your sheet, then the value.",
      type: "keyvalue-list",
      required: false,
      listMaxItems: MAX_BATCH_ROWS,
    }),
    [batchFieldName, field.name],
  );

  const columnsLoading =
    columnsState.status === "loading" || columnsState.status === "idle";
  const columnsDetected = columns.length > 0;
  const columnsFailed =
    columnsState.status === "error" ||
    columnsState.status === "disconnected" ||
    columnsState.status === "needs-reconnect" ||
    columnsState.status === "owner-gated" ||
    columnsState.status === "owner-must-connect";

  return (
    <div
      className="flex min-w-0 flex-col gap-3"
      data-testid={`spreadsheet-rows-${field.name}`}
    >
      {batchFieldName ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium">What are you adding?</p>
          <SpreadsheetRowModeToggle
            mode={mode}
            onModeChange={handleModeChange}
            disabled={disabled}
          />
        </div>
      ) : null}

      {columnsLoading ? (
        <p
          role="status"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Reading your sheet&rsquo;s columns…
        </p>
      ) : null}

      {columnsDetected ? (
        <p className="text-xs text-muted-foreground">
          Columns come from the first row of your selected worksheet. Leave a
          field blank to keep that cell empty.
        </p>
      ) : null}

      {columnsState.status === "empty" ? (
        <p
          role="status"
          data-testid={`spreadsheet-rows-${field.name}-no-columns`}
          className="rounded-md border border-dashed p-3 text-xs text-muted-foreground"
        >
          We couldn&rsquo;t detect any column names in this sheet. Add names to
          the first row of your sheet and reopen this step, or fill in values
          below.
        </p>
      ) : null}

      {columnsFailed ? (
        <div
          role="alert"
          data-testid={`spreadsheet-rows-${field.name}-columns-error`}
          className="flex flex-col gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground"
        >
          <span>
            {"message" in columnsState && columnsState.message
              ? columnsState.message
              : "Couldn't read the worksheet's columns."}
          </span>
          {columnsState.status === "error" ? (
            <span>
              <Button type="button" variant="outline" size="sm" onClick={refetch}>
                Try again
              </Button>
            </span>
          ) : null}
        </div>
      ) : null}

      {recordNeedsColumns && !columnsLoading ? (
        <p
          role="status"
          data-testid={`spreadsheet-rows-${field.name}-record-needs-columns`}
          className="rounded-md border border-dashed p-3 text-xs text-muted-foreground"
        >
          This step already has values saved against your column names. We
          can&rsquo;t show them until the column list loads, so nothing is
          editable here yet — your saved values are untouched.
        </p>
      ) : null}

      {columnsLoading || mode !== "one" || recordNeedsColumns ? null : (
        <SpreadsheetSuggestions
          fieldName={field.name}
          suggestions={suggestions}
          onAccept={acceptSuggestion}
          onAcceptAll={acceptAllSuggestions}
          disabled={disabled}
        />
      )}

      {columnsLoading || recordNeedsColumns ? null : mode === "one" ? (
        <SpreadsheetSingleRowEditor
          fieldName={field.name}
          columns={columns}
          cells={cells}
          onCellChange={handleCellChange}
          onAddCell={handleAddCell}
          onRemoveCell={handleRemoveCell}
          disabled={disabled}
          sources={sources}
          latestValuesBySource={latestValuesBySource}
        />
      ) : columnsDetected ? (
        <SpreadsheetBatchRowsEditor
          fieldName={field.name}
          columns={columns}
          grid={grid}
          onCellChange={handleGridCellChange}
          onAddRow={handleAddRow}
          onRemoveRow={handleRemoveRow}
          maxRows={MAX_BATCH_ROWS}
          disabled={disabled}
          sources={sources}
          latestValuesBySource={latestValuesBySource}
        />
      ) : (
        <KeyValueListField
          field={manualBatchFieldMeta}
          value={batchValue}
          onChange={(next) => {
            if (!batchFieldName || !onChangeField) return;
            onChangeField(batchFieldName, dropEmptyBatchRecords(next));
          }}
          {...(disabled !== undefined && { disabled })}
        />
      )}

      {columnsLoading || recordNeedsColumns ? null : mode === "one" ? (
        <SpreadsheetHonestPreview
          fieldName={field.name}
          preview={rowPreview}
        />
      ) : columnsDetected ? (
        <SpreadsheetPreview
          fieldName={field.name}
          columns={columns}
          rows={grid}
          mode="several"
        />
      ) : null}

      <p className="text-[11px] text-muted-foreground">
        Values can come from earlier steps. Use the {"{x}"} button next to any
        field to insert data from your trigger or a previous step.
      </p>
    </div>
  );
}
