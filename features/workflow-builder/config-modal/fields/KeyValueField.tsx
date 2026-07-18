"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldShell } from "./FieldShell";
import type { FieldRendererProps } from "./types";

/**
 * `keyvalue` field renderer. Repeating list of {key, value} rows.
 *
 * Value shape is driven by `FieldMeta.keyValueShape` (CONFIG-UX-AUDIT-1):
 *
 *   - `"pairs"` (default): `Array<{key: string; value: string}>` — the
 *     keyvalue Zod schema used by native handlers (HTTP headers / query
 *     params; duplicates allowed). Unchanged from Slice 3.1.
 *   - `"record"`: `Record<string, string>` — the wire-format shape
 *     Stripe `metadata` / Mailchimp event `properties` / Excel
 *     `update_row.values` schemas expect. Rows live in LOCAL edit state
 *     (so typing a key doesn't collapse/reorder entries mid-keystroke);
 *     each edit commits the serialized record upward. Rows with an
 *     empty key are kept in edit state but omitted from the record; an
 *     all-empty editor commits `undefined` so optional fields drop out
 *     of the saved config.
 *
 * Per FieldMeta.keyValueMaxRows: when the cap is reached, the "Add row"
 * button is disabled. The schema enforces the same cap at save time.
 *
 * Slice 3.1 scope:
 *   - No duplicate-key enforcement at the renderer level in PAIRS mode.
 *     Some keyvalue surfaces (HTTP headers) intentionally allow
 *     duplicates; the handler schema validates per-call.
 *   - No drag-reorder. Rows are kept in insertion order.
 *
 * Batch R1 — record-mode row hints (plain-language audit): record mode
 * silently omitted empty-key rows from the committed value and
 * last-write-wins on duplicate keys. Both now surface a visible per-row
 * message ("give this row a name…" / "…only the last value will be
 * saved") so nothing the user can see disappears unnoticed. Pairs mode
 * is deliberately unchanged: it commits every row as-is (nothing is
 * silently dropped) and duplicates are legal there.
 */

type Row = { key: string; value: string };

function asRows(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  const rows: Row[] = [];
  for (const entry of value) {
    if (entry && typeof entry === "object") {
      const k = (entry as Record<string, unknown>).key;
      const v = (entry as Record<string, unknown>).value;
      rows.push({
        key: typeof k === "string" ? k : "",
        value: typeof v === "string" ? v : "",
      });
    }
  }
  return rows;
}

function rowsFromRecord(value: unknown): Row[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const rows: Row[] = [];
  for (const [k, v] of Object.entries(value)) {
    rows.push({ key: k, value: typeof v === "string" ? v : String(v ?? "") });
  }
  return rows;
}

function serializeRecord(rows: Row[]): Record<string, string> | undefined {
  const record: Record<string, string> = {};
  let count = 0;
  for (const row of rows) {
    const key = row.key.trim();
    if (key.length === 0) continue;
    record[key] = row.value;
    count += 1;
  }
  return count === 0 ? undefined : record;
}

export const KeyValueField: React.FC<FieldRendererProps> = (props) => {
  if (props.field.keyValueShape === "record") {
    return <RecordModeBody {...props} />;
  }
  return <PairsModeBody {...props} />;
};

/**
 * Batch R1 — per-row messages for the two record-mode silent-loss paths.
 * Aligned by row index; `null` = row is fine. Derived on every render —
 * correcting the row clears its message with no extra state.
 */
function computeRecordRowIssues(rows: Row[]): Array<string | null> {
  const keyCounts = new Map<string, number>();
  for (const row of rows) {
    const key = row.key.trim();
    if (key.length === 0) continue;
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  }
  return rows.map((row) => {
    const key = row.key.trim();
    if (key.length === 0) {
      // A fully-empty row is a just-added row — flagging it immediately
      // would be noise. Flag only once a value exists to lose.
      return row.value.trim().length > 0
        ? "Give this row a name, or it won't be saved."
        : null;
    }
    if ((keyCounts.get(key) ?? 0) > 1) {
      return `"${key}" is used more than once — only the last value will be saved.`;
    }
    return null;
  });
}

/** `"record"` mode — local edit state, commits `Record<string, string>`. */
const RecordModeBody: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
}) => {
  const [rows, setRows] = React.useState<Row[]>(() => rowsFromRecord(value));
  const handleRowsChange = (next: Row[]): void => {
    setRows(next);
    onChange(serializeRecord(next));
  };
  return (
    <KeyValueRowsEditor
      field={field}
      rows={rows}
      error={error}
      disabled={disabled}
      onRowsChange={handleRowsChange}
      rowIssues={computeRecordRowIssues(rows)}
    />
  );
};

/** `"pairs"` mode (default) — fully controlled, commits `Array<{key, value}>`. */
const PairsModeBody: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
}) => {
  return (
    <KeyValueRowsEditor
      field={field}
      rows={asRows(value)}
      error={error}
      disabled={disabled}
      onRowsChange={(next) => onChange(next)}
    />
  );
};

const KeyValueRowsEditor: React.FC<{
  field: FieldRendererProps["field"];
  rows: Row[];
  error: string | undefined;
  disabled: boolean | undefined;
  onRowsChange: (rows: Row[]) => void;
  /**
   * Batch R1 — per-row inline messages (record mode only), aligned by
   * row index; `null` = no message. Pairs mode passes nothing.
   */
  rowIssues?: ReadonlyArray<string | null>;
}> = ({ field, rows, error, disabled, onRowsChange, rowIssues }) => {
  const controlId = `field-${field.name}`;
  const maxRows = field.keyValueMaxRows;
  const atCap = maxRows !== undefined && rows.length >= maxRows;

  function commit(next: Row[]): void {
    onRowsChange(next);
  }

  function updateRow(index: number, patch: Partial<Row>): void {
    const next = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    commit(next);
  }

  function addRow(): void {
    if (atCap) return;
    commit([...rows, { key: "", value: "" }]);
  }

  function removeRow(index: number): void {
    commit(rows.filter((_, i) => i !== index));
  }

  return (
    <FieldShell
      controlId={controlId}
      label={field.label}
      required={field.required}
      description={field.description}
      error={error}
    >
      <div className="flex flex-col gap-2" role="group" aria-labelledby={controlId}>
        {rows.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">
            No rows yet. Add a row to get started.
          </p>
        ) : null}
        {rows.map((row, i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Input
                aria-label={`${field.label} key ${i + 1}`}
                placeholder="key"
                value={row.key}
                disabled={disabled}
                aria-invalid={rowIssues?.[i] ? true : undefined}
                onChange={(e) => updateRow(i, { key: e.target.value })}
                className="flex-1"
              />
              <Input
                aria-label={`${field.label} value ${i + 1}`}
                placeholder="value"
                value={row.value}
                disabled={disabled}
                onChange={(e) => updateRow(i, { value: e.target.value })}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${field.label} row ${i + 1}`}
                onClick={() => removeRow(i)}
                disabled={disabled}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {rowIssues?.[i] ? (
              <p
                role="alert"
                data-testid={`field-${field.name}-row-${i}-error`}
                className="text-xs text-destructive"
              >
                {rowIssues[i]}
              </p>
            ) : null}
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            disabled={disabled || atCap}
          >
            <Plus className="h-4 w-4" />
            Add row{atCap ? ` (max ${maxRows})` : ""}
          </Button>
        </div>
      </div>
    </FieldShell>
  );
};
