"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActiveNodeUpstreamVariables } from "../../hooks/useActiveNodeUpstreamVariables";
import { FieldShell } from "./FieldShell";
import { VariablePickerButton } from "./VariablePickerButton";
import { insertAtCursor } from "./_insertAtCursor";
import type { FieldRendererProps } from "./types";
import {
  ROUTER_MAX_ROUTES,
  ROUTER_OPERATORS,
  ROUTER_OPERATOR_LABELS,
  ROUTER_UNARY_OPERATORS,
  asRouteRows,
  validateRoutesValue,
  type RouteRow,
  type RouterOperator,
} from "./_routesValidator";
import type { VariableSource } from "../../hooks/useUpstreamVariables";

/**
 * `router-routes` field renderer — Slice 3.6.
 *
 * Renders the `native:router` action's `routes` field as a list of
 * editable rows. Each row exposes:
 *   - Label (text input, required, unique within the routes list)
 *   - Input (text input — typically a `{{variable}}` template)
 *   - Operator (select, 14 options)
 *   - Value (text input — hidden when the operator is unary)
 *
 * Saving the field produces the exact shape the runtime schema in
 * `integrations/native/actions/router.schema.ts` expects:
 *
 *   Array<{
 *     label: string;
 *     condition: { input: unknown; operator: Operator; value?: unknown };
 *   }>
 *
 * The unary-operator branch DROPS the `value` key entirely (omits it
 * from the saved object) rather than emitting `value: undefined` — the
 * schema's `.strict()` mode rejects the latter.
 *
 * Validation: the pure `validateRoutesValue` helper renders the
 * inline error via `FieldShell.error` AND drives the per-row error
 * hints below each row. ConfigModalShell also calls the same
 * validator to gate the modal Save button — see
 * `ConfigModalShell.tsx` for the Save-gating path.
 *
 * Limits:
 *   - At most ROUTER_MAX_ROUTES rows (defensive cap; matches the
 *     server schema's 32).
 *   - At least one route required at runtime; the renderer surfaces
 *     "Add at least one route." as the top-level error when empty.
 */

interface SavedRoute {
  label: string;
  condition: {
    input: unknown;
    operator: RouterOperator;
    value?: unknown;
  };
}

function rowToSaved(row: RouteRow): SavedRoute {
  const isUnary = ROUTER_UNARY_OPERATORS.has(row.condition.operator);
  if (isUnary) {
    // Strip value when operator is unary so the saved shape matches
    // `.strict()` schema (which rejects `value: undefined` on unary).
    return {
      label: row.label,
      condition: {
        input: row.condition.input,
        operator: row.condition.operator,
      },
    };
  }
  return {
    label: row.label,
    condition: {
      input: row.condition.input,
      operator: row.condition.operator,
      value: row.condition.value ?? "",
    },
  };
}

function blankRow(): RouteRow {
  return {
    label: "",
    condition: { input: "", operator: "equals", value: "" },
  };
}

export const RouterRoutesField: React.FC<FieldRendererProps> = ({
  field,
  value,
  error: parentError,
  onChange,
  disabled,
}) => {
  const rows = asRouteRows(value);
  const controlId = `field-${field.name}`;
  const atCap = rows.length >= ROUTER_MAX_ROUTES;

  // Local validation drives the inline error UI. The parent's `error`
  // takes precedence so a future server-side message can still show.
  const validation = validateRoutesValue(value);
  const surfaceError = parentError ?? validation.error ?? undefined;

  // Slice 3.7 — single hook call at the field level (stable hook
  // profile regardless of row count). The row child component owns
  // its own input ref so picker insertion targets the right input
  // without us tracking refs across N rows.
  const { sources } = useActiveNodeUpstreamVariables();

  function commit(next: RouteRow[]): void {
    onChange(next.map(rowToSaved));
  }

  function updateLabel(index: number, label: string): void {
    commit(
      rows.map((r, i) => (i === index ? { ...r, label } : r)),
    );
  }

  function updateInput(index: number, input: string): void {
    commit(
      rows.map((r, i) =>
        i === index
          ? { ...r, condition: { ...r.condition, input } }
          : r,
      ),
    );
  }

  function updateOperator(index: number, operator: RouterOperator): void {
    commit(
      rows.map((r, i) => {
        if (i !== index) return r;
        const isUnary = ROUTER_UNARY_OPERATORS.has(operator);
        return {
          ...r,
          condition: isUnary
            ? { input: r.condition.input, operator }
            : {
                input: r.condition.input,
                operator,
                // Preserve any existing value across binary↔binary changes;
                // unary→binary starts with an empty value.
                value: r.condition.value ?? "",
              },
        };
      }),
    );
  }

  function updateValue(index: number, val: string): void {
    commit(
      rows.map((r, i) =>
        i === index
          ? { ...r, condition: { ...r.condition, value: val } }
          : r,
      ),
    );
  }

  function addRow(): void {
    if (atCap) return;
    commit([...rows, blankRow()]);
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
      error={surfaceError}
    >
      <div
        className="flex flex-col gap-3"
        role="group"
        aria-labelledby={controlId}
        data-testid="router-routes-field"
      >
        {rows.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">
            No routes yet. Add a route to get started.
          </p>
        ) : null}
        {rows.map((row, i) => {
          const isUnary = ROUTER_UNARY_OPERATORS.has(row.condition.operator);
          const rowError = validation.rowErrors[i];
          const inputValue =
            typeof row.condition.input === "string" ? row.condition.input : "";
          const stringValue =
            typeof row.condition.value === "string" ? row.condition.value : "";
          return (
            <div
              key={i}
              className="flex flex-col gap-2 rounded border border-input bg-muted/30 p-3"
              data-testid={`router-route-row-${i}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Route {i + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove route ${i + 1}`}
                  onClick={() => removeRow(i)}
                  disabled={disabled}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Input
                aria-label={`Route ${i + 1} label`}
                placeholder="label"
                value={row.label}
                disabled={disabled}
                onChange={(e) => updateLabel(i, e.target.value)}
              />
              <RouterRouteTextInput
                ariaLabel={`Route ${i + 1} input`}
                placeholder="{{trigger.field}}"
                value={inputValue}
                disabled={disabled}
                onChange={(next) => updateInput(i, next)}
                className="font-mono"
                sources={sources}
                pickerTestIdRoot={`router-row-${i}-input-picker`}
              />
              {/*
                Native <select> rather than the Radix Select wrapper:
                a 14-item operator list is appropriate for a native
                picker, native selects are reliable in jsdom test
                environments (Radix portals are not), and the visual
                weight inside an already-busy row stays low.
              */}
              <select
                aria-label={`Route ${i + 1} operator`}
                value={row.condition.operator}
                onChange={(e) =>
                  updateOperator(i, e.target.value as RouterOperator)
                }
                disabled={disabled}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {ROUTER_OPERATORS.map((op) => (
                  <option key={op} value={op}>
                    {ROUTER_OPERATOR_LABELS[op]}
                  </option>
                ))}
              </select>
              {!isUnary ? (
                <RouterRouteTextInput
                  ariaLabel={`Route ${i + 1} value`}
                  placeholder="value to compare against"
                  value={stringValue}
                  disabled={disabled}
                  onChange={(next) => updateValue(i, next)}
                  sources={sources}
                  pickerTestIdRoot={`router-row-${i}-value-picker`}
                />
              ) : null}
              {rowError ? (
                <p
                  role="alert"
                  className="text-xs text-destructive"
                  data-testid={`router-route-row-${i}-error`}
                >
                  {rowError}
                </p>
              ) : null}
            </div>
          );
        })}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            disabled={disabled || atCap}
          >
            <Plus className="h-4 w-4" />
            Add route{atCap ? ` (max ${ROUTER_MAX_ROUTES})` : ""}
          </Button>
        </div>
      </div>
    </FieldShell>
  );
};

interface RouterRouteTextInputProps {
  ariaLabel: string;
  placeholder?: string;
  value: string;
  disabled?: boolean;
  onChange: (next: string) => void;
  className?: string;
  sources: readonly VariableSource[];
  pickerTestIdRoot: string;
}

/**
 * Slice 3.7 — per-row text input + variable picker for the router
 * editor. Lives in its own component so each (row, subfield) gets a
 * stable hook profile (one useRef) instead of forcing the parent
 * field to manage refs across N rows.
 */
function RouterRouteTextInput({
  ariaLabel,
  placeholder,
  value,
  disabled,
  onChange,
  className,
  sources,
  pickerTestIdRoot,
}: RouterRouteTextInputProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  function handleInsertAtCursor(token: string): void {
    const el = inputRef.current;
    const { nextValue } = insertAtCursor({
      value,
      insert: token,
      selectionStart: el?.selectionStart,
      selectionEnd: el?.selectionEnd,
    });
    onChange(nextValue);
  }

  return (
    <div className="flex items-start gap-2">
      <Input
        ref={inputRef}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={className ? `${className} flex-1` : "flex-1"}
      />
      <VariablePickerButton
        sources={sources}
        onInsertAtCursor={handleInsertAtCursor}
        ariaLabel={`Insert variable into ${ariaLabel}`}
        testIdRoot={pickerTestIdRoot}
      />
    </div>
  );
}
