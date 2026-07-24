"use client";

import * as React from "react";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfigSlice } from "../../state/configSlice";
import { useGraphSlice } from "../../state/graphSlice";
import { useSchemaSuggestion } from "../../hooks/useSchemaSuggestion";
import { FieldShell } from "./FieldShell";
import type { FieldRendererProps } from "./types";
import {
  SCHEMA_FIELDS_MAX_ROWS,
  readSchemaFieldsValue,
  validateSchemaFieldsValue,
  type SchemaFieldRow,
  type SchemaFieldsValue,
} from "./_schemaFieldsValidator";
import {
  describeMerge,
  mergeSuggestedFields,
  replaceWithSuggestedFields,
} from "./_schemaFieldsSuggestion";
import { SchemaFieldsRow } from "./SchemaFieldsRow";
import { SchemaFieldsSuggestPanel } from "./SchemaFieldsSuggestPanel";

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
 * Suggest fields (AI-PROVIDER-7 CS-7): when the meta declares which sibling
 * field holds the document (`sampleSourceField`), the action row gains a
 * "Suggest fields" button. It reads a real sample of the author's own data
 * through the gated route and returns a PROPOSAL — which lands as ordinary
 * editable rows via the same `commit()` every manual edit uses, so validation,
 * normalization, ordering, and the Save gate all behave identically. Existing
 * rows are never replaced without a second, explicit click.
 */
export function SchemaFieldsField({
  field,
  value,
  error,
  onChange,
  disabled,
}: FieldRendererProps) {
  const rows = React.useMemo(() => readSchemaFieldsValue(value), [value]);

  // AI-PROVIDER-7 — the Suggest-fields request. Scoped to the workflow being
  // edited + the node whose config rail is open; the server re-reads both.
  const workflowId = useGraphSlice((s) => s.workflowId);
  const activeNodeId = useConfigSlice((s) => s.activeNodeId);
  const suggestion = useSchemaSuggestion({
    workflowId,
    nodeId: activeNodeId,
    sampleSourceField: field.sampleSourceField,
  });
  const [mergeNotice, setMergeNotice] = React.useState<string | null>(null);

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

  const applyProposal = (mode: "add" | "replace") => {
    if (suggestion.state.status !== "proposal") return;
    const result =
      mode === "add"
        ? mergeSuggestedFields(rows, suggestion.state.proposal.fields)
        : replaceWithSuggestedFields(suggestion.state.proposal.fields);
    commit(result.rows);
    setMergeNotice(describeMerge(result));
    suggestion.dismiss();
  };

  const startSuggestion = () => {
    setMergeNotice(null);
    suggestion.request();
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
        <SchemaFieldsSuggestPanel
          state={suggestion.state}
          hasExistingRows={rows.length > 0}
          {...(disabled !== undefined ? { disabled } : {})}
          onAdd={() => applyProposal("add")}
          onReplace={() => applyProposal("replace")}
          onRetry={startSuggestion}
          onDismiss={suggestion.dismiss}
        />
        {mergeNotice !== null ? (
          <p
            data-testid="schema-fields-suggest-notice"
            role="status"
            className="px-1 text-[11px]"
            style={{ color: "var(--builder-muted)" }}
          >
            {mergeNotice}
          </p>
        ) : null}
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
          {suggestion.available ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startSuggestion}
              disabled={disabled || suggestion.state.status === "loading"}
              data-testid="schema-fields-suggest"
            >
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              Suggest fields
            </Button>
          ) : null}
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
