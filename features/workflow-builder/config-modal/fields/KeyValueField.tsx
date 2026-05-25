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
 * Value shape: `Array<{key: string; value: string}>` — matches the
 * keyvalue Zod schema used by native handlers (HTTP headers / query
 * params / etc.). Non-array values are normalized to an empty array.
 *
 * Per FieldMeta.keyValueMaxRows: when the cap is reached, the "Add row"
 * button is disabled. The schema enforces the same cap at save time.
 *
 * Slice 3.1 scope:
 *   - No duplicate-key enforcement at the renderer level. Some
 *     keyvalue surfaces (HTTP headers) intentionally allow duplicates;
 *     the handler schema validates per-call.
 *   - No drag-reorder. Rows are kept in insertion order.
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

export const KeyValueField: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
}) => {
  const rows = asRows(value);
  const controlId = `field-${field.name}`;
  const maxRows = field.keyValueMaxRows;
  const atCap = maxRows !== undefined && rows.length >= maxRows;

  function commit(next: Row[]): void {
    onChange(next);
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
          <p className="text-xs italic text-muted-foreground">No entries.</p>
        ) : null}
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              aria-label={`${field.label} key ${i + 1}`}
              placeholder="key"
              value={row.key}
              disabled={disabled}
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
