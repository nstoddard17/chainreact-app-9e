"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldShell } from "./FieldShell";
import type { FieldRendererProps } from "./types";
import {
  SCHEMA_FIELDS_MAX_ROWS,
  readSchemaFieldsValue,
  validateSchemaFieldsValue,
  type SchemaFieldRow,
  type SchemaFieldsValue,
} from "./_schemaFieldsValidator";
import { SchemaFieldsRow } from "./SchemaFieldsRow";

/**
 * `schema-fields` renderer (AI-PROVIDER-4 CS-4) — the structured editor for
 * a user-defined extraction / destination schema.
 *
 * Value contract: commits a REAL `{ fields: [{name, type, required?,
 * description?}] }` object matching the committed `UserDefinedSchemaSchema`
 * (contracts/aiProcessing.ts). Never a JSON string — the AI processor
 * compiles this straight into the model's output contract. Clearing the last
 * row commits `undefined` so an optional schema drops out of the config.
 *
 * Names normalize to safe workflow-variable identifiers on blur
 * (`Employee Name` → `employee_name`) so a downstream reference like
 * `{{node.fields.employee_name}}` stays a clean path segment.
 *
 * Extension point (CS-7): the header's action row is where "Suggest fields"
 * lands — it will call the gated suggest-schema route and MERGE the proposal
 * into `rows` as editable entries. Nothing here needs restructuring for that:
 * row state is already a plain array owned by this component, and the merge
 * is just another `commit(...)` call.
 */
export function SchemaFieldsField({
  field,
  value,
  error,
  onChange,
  disabled,
}: FieldRendererProps) {
  const rows = React.useMemo(() => readSchemaFieldsValue(value), [value]);

  const validation = React.useMemo(
    () => validateSchemaFieldsValue(value, { required: field.required === true }),
    [value, field.required],
  );

  const commit = React.useCallback(
    (next: SchemaFieldRow[]) => {
      if (next.length === 0) {
        onChange(undefined);
        return;
      }
      const cleaned: SchemaFieldsValue = {
        fields: next.map((row) => ({
          name: row.name,
          type: row.type,
          ...(row.required === true ? { required: true } : {}),
          ...(typeof row.description === "string" && row.description.trim() !== ""
            ? { description: row.description }
            : {}),
        })),
      };
      onChange(cleaned);
    },
    [onChange],
  );

  const addRow = () => {
    if (rows.length >= SCHEMA_FIELDS_MAX_ROWS) return;
    commit([...rows, { name: "", type: "string" }]);
  };

  const updateRow = (index: number, next: SchemaFieldRow) => {
    const copy = [...rows];
    copy[index] = next;
    commit(copy);
  };

  const removeRow = (index: number) => {
    commit(rows.filter((_, i) => i !== index));
  };

  const moveRow = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const copy = [...rows];
    const moved = copy[index]!;
    copy[index] = copy[target]!;
    copy[target] = moved;
    commit(copy);
  };

  const atMax = rows.length >= SCHEMA_FIELDS_MAX_ROWS;
  // The renderer owns its structural message; SchemaForm's generic `error`
  // (e.g. required-but-empty) still wins when present.
  const shellError = error ?? validation.error ?? undefined;

  return (
    <FieldShell
      controlId={`schema-fields-${field.name}`}
      label={field.label}
      required={field.required === true}
      {...(field.description !== undefined
        ? { description: field.description }
        : {})}
      error={shellError}
    >
      <div className="flex flex-col gap-1.5">
        {rows.length === 0 ? (
          <p
            className="px-1 text-[11.5px]"
            style={{ color: "var(--builder-muted)" }}
          >
            No fields yet. Add one for each value you want back.
          </p>
        ) : (
          <ul
            aria-label={`${field.label} rows`}
            className="flex flex-col overflow-hidden rounded-[5px]"
            style={{ border: "1px solid var(--builder-border)" }}
          >
            {rows.map((row, index) => (
              <SchemaFieldsRow
                key={index}
                row={row}
                index={index}
                rowCount={rows.length}
                error={validation.rowErrors[index]}
                {...(disabled !== undefined ? { disabled } : {})}
                onChange={updateRow}
                onRemove={removeRow}
                onMove={moveRow}
              />
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            disabled={disabled || atMax}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add field
          </Button>
          {atMax ? (
            <span
              className="text-[11px]"
              style={{ color: "var(--builder-muted)" }}
            >
              Maximum {SCHEMA_FIELDS_MAX_ROWS} fields.
            </span>
          ) : rows.length > 0 ? (
            <span
              className="text-[11px]"
              style={{ color: "var(--builder-muted)" }}
            >
              {rows.length} field{rows.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      </div>
    </FieldShell>
  );
}
