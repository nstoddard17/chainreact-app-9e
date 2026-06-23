"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { FieldShell } from "./FieldShell";
import {
  fromControlValue,
  isTemporalCompatible,
  nativeInputType,
  type TemporalKind,
} from "./_temporal";
import type { FieldRendererProps } from "./types";

/**
 * Shared renderer for the `date` / `time` / `datetime` field types (CS-1).
 * One component for all three — it reads `field.type` to pick the native
 * input type — so the parse/format rules stay in `_temporal.ts` and there is
 * no per-kind duplication.
 *
 * Value contract: a string (see `_temporal.ts`) or undefined. The renderer
 * stores exactly the schema-expected string and NEVER converts timezone /
 * date↔datetime semantics.
 *
 * Hydration + robustness:
 *   - Empty or pattern-compatible value → native picker, pre-filled.
 *   - Non-empty incompatible value (a `{{variable}}` token, an offset-bearing
 *     instant, or garbage) → a raw text input pre-filled with the value plus a
 *     note, so nothing crashes and the value is never silently reinterpreted.
 *   - Clearing emits `undefined` (optional fields clear); the schema still
 *     enforces required-ness on save.
 */
export const TemporalField: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
}) => {
  const kind = field.type as TemporalKind;
  const stringValue = typeof value === "string" ? value : "";
  const controlId = `field-${field.name}`;
  const compatible = isTemporalCompatible(kind, stringValue);

  const describedBy = error
    ? `${controlId}-err`
    : field.description
      ? `${controlId}-help`
      : undefined;

  return (
    <FieldShell
      controlId={controlId}
      label={field.label}
      required={field.required}
      description={field.description}
      error={error}
    >
      {compatible ? (
        <Input
          id={controlId}
          name={field.name}
          type={nativeInputType(kind)}
          data-testid={`temporal-${field.name}`}
          data-temporal-kind={kind}
          value={stringValue}
          step={kind === "time" ? 1 : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          onChange={(e) => onChange(fromControlValue(kind, e.target.value))}
        />
      ) : (
        <div className="flex flex-col gap-1">
          <Input
            id={controlId}
            name={field.name}
            type="text"
            data-testid={`temporal-${field.name}`}
            data-temporal-fallback="true"
            value={stringValue}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            disabled={disabled}
            onChange={(e) => {
              const raw = e.target.value;
              onChange(raw === "" ? undefined : raw);
            }}
          />
          <p className="text-xs text-muted-foreground" data-testid={`temporal-${field.name}-fallback-note`}>
            Unrecognized {kind === "datetime" ? "date/time" : kind} format — shown as text. Clear it to use the picker.
          </p>
        </div>
      )}
    </FieldShell>
  );
};
