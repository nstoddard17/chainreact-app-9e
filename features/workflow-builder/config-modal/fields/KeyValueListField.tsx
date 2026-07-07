"use client";

import * as React from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldShell } from "./FieldShell";
import type { FieldRendererProps } from "./types";

/**
 * `keyvalue-list` field renderer (CONFIG-UX-AUDIT-1) — a repeating list of
 * rows where EACH row is a free-key column→value map. First consumer:
 * Excel `add_row` batch mode (`rows: [{Name: "Ada", Email: "…"}]`),
 * replacing its paste-JSON textarea.
 *
 * Value contract:
 *   - Writes a REAL `Array<Record<string, string>>` — never a
 *     JSON-encoded string (paste-JSON literals were stored as strings
 *     and rejected by the runtime `z.array(z.record(...))` schema).
 *   - Column names must be non-empty to serialize; an in-progress pair
 *     with an empty column name is kept in local edit state but omitted
 *     from the committed value.
 *   - Removing the last row writes `undefined` so optional fields drop
 *     out of the saved config (matters for either-or schemas like Excel
 *     `values` XOR `rows`).
 *
 * Rows/pairs live in LOCAL component state (initialized from the config
 * value) so typing a column name doesn't reorder keys mid-keystroke;
 * every edit commits the serialized records upward. The modal remounts
 * the renderer per open, so external resets re-hydrate naturally.
 */

type Pair = { key: string; value: string };
type PairRow = Pair[];

function rowsFromValue(value: unknown): PairRow[] {
  if (!Array.isArray(value)) return [];
  const rows: PairRow[] = [];
  for (const entry of value) {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const pairs: PairRow = [];
      for (const [k, v] of Object.entries(entry)) {
        pairs.push({
          key: k,
          value:
            typeof v === "string"
              ? v
              : typeof v === "number" || typeof v === "boolean"
                ? String(v)
                : "",
        });
      }
      rows.push(pairs);
    }
  }
  return rows;
}

function serializeRows(rows: PairRow[]): Array<Record<string, string>> | undefined {
  const out: Array<Record<string, string>> = [];
  for (const pairs of rows) {
    const record: Record<string, string> = {};
    for (const p of pairs) {
      const key = p.key.trim();
      if (key.length === 0) continue;
      record[key] = p.value;
    }
    out.push(record);
  }
  return out.length === 0 ? undefined : out;
}

export const KeyValueListField: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
}) => {
  const controlId = `field-${field.name}`;
  const [rows, setRows] = React.useState<PairRow[]>(() => rowsFromValue(value));
  const maxItems = field.listMaxItems;
  const atCap = maxItems !== undefined && rows.length >= maxItems;

  function commit(next: PairRow[]): void {
    setRows(next);
    onChange(serializeRows(next));
  }

  function addRow(): void {
    if (disabled || atCap) return;
    // Seed the new row with the previous row's column names — batch rows
    // almost always share the same columns.
    const template = rows[rows.length - 1];
    const seeded: PairRow = template
      ? template.map((p) => ({ key: p.key, value: "" }))
      : [{ key: "", value: "" }];
    commit([...rows, seeded]);
  }

  function removeRow(rowIndex: number): void {
    if (disabled) return;
    commit(rows.filter((_, i) => i !== rowIndex));
  }

  function addPair(rowIndex: number): void {
    if (disabled) return;
    commit(
      rows.map((pairs, i) =>
        i === rowIndex ? [...pairs, { key: "", value: "" }] : pairs,
      ),
    );
  }

  function removePair(rowIndex: number, pairIndex: number): void {
    if (disabled) return;
    commit(
      rows.map((pairs, i) =>
        i === rowIndex ? pairs.filter((_, j) => j !== pairIndex) : pairs,
      ),
    );
  }

  function updatePair(
    rowIndex: number,
    pairIndex: number,
    patch: Partial<Pair>,
  ): void {
    commit(
      rows.map((pairs, i) =>
        i === rowIndex
          ? pairs.map((p, j) => (j === pairIndex ? { ...p, ...patch } : p))
          : pairs,
      ),
    );
  }

  return (
    <FieldShell
      controlId={controlId}
      label={field.label}
      required={field.required}
      description={field.description}
      error={error}
    >
      <div
        className="flex flex-col gap-3"
        role="group"
        aria-labelledby={controlId}
        data-testid={`keyvalue-list-${field.name}`}
      >
        {rows.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">
            No rows added yet.
          </p>
        ) : null}
        {rows.map((pairs, rowIndex) => (
          <div
            key={rowIndex}
            className="flex flex-col gap-2 rounded-md border p-3"
            data-testid={`keyvalue-list-${field.name}-row-${rowIndex}`}
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
                onClick={() => removeRow(rowIndex)}
                disabled={disabled}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {pairs.map((pair, pairIndex) => (
              <div key={pairIndex} className="flex items-center gap-2">
                <Input
                  aria-label={`Row ${rowIndex + 1} column ${pairIndex + 1} name`}
                  placeholder="Column"
                  value={pair.key}
                  disabled={disabled}
                  onChange={(e) =>
                    updatePair(rowIndex, pairIndex, { key: e.target.value })
                  }
                  className="flex-1"
                />
                <Input
                  aria-label={`Row ${rowIndex + 1} column ${pairIndex + 1} value`}
                  placeholder="Value"
                  value={pair.value}
                  disabled={disabled}
                  onChange={(e) =>
                    updatePair(rowIndex, pairIndex, { value: e.target.value })
                  }
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove row ${rowIndex + 1} column ${pairIndex + 1}`}
                  onClick={() => removePair(rowIndex, pairIndex)}
                  disabled={disabled}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => addPair(rowIndex)}
                disabled={disabled}
                aria-label={`Add column to row ${rowIndex + 1}`}
              >
                <Plus className="h-3.5 w-3.5" />
                Add column
              </Button>
            </div>
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            disabled={disabled || atCap}
            data-testid={`keyvalue-list-${field.name}-add-row`}
          >
            <Plus className="h-4 w-4" />
            Add row{atCap ? ` (max ${maxItems})` : ""}
          </Button>
        </div>
      </div>
    </FieldShell>
  );
};
