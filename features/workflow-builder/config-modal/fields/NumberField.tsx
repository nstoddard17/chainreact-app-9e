"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { FieldShell } from "./FieldShell";
import type { FieldRendererProps } from "./types";

/**
 * `number` field renderer. Native <input type="number"> with min/max/
 * step from FieldMeta.numeric.
 *
 * Value contract:
 *   - empty input → undefined (the form layer decides whether absence
 *     is allowed; the schema enforces required-ness on save).
 *   - non-empty input → number. Native browser parsing handles partial
 *     edits ("12.") gracefully — onChange fires the parsed number when
 *     the value is finalizable.
 */

export const NumberField: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
}) => {
  const numericValue =
    typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
  const controlId = `field-${field.name}`;
  const bounds = field.numeric;
  return (
    <FieldShell
      controlId={controlId}
      label={field.label}
      required={field.required}
      description={field.description}
      error={error}
    >
      <Input
        id={controlId}
        name={field.name}
        type="number"
        inputMode={bounds?.integer ? "numeric" : "decimal"}
        value={numericValue}
        placeholder={field.placeholder}
        min={bounds?.min}
        max={bounds?.max}
        step={bounds?.step ?? (bounds?.integer ? 1 : undefined)}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error ? `${controlId}-err` : field.description ? `${controlId}-help` : undefined
        }
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(undefined);
            return;
          }
          const parsed = bounds?.integer ? parseInt(raw, 10) : parseFloat(raw);
          if (Number.isNaN(parsed)) {
            // Keep the raw string in the input via controlled value (the
            // useState would, but we don't manage internal state here).
            // Defer to parent: emit the raw string so the form can show
            // a validation error on the next render cycle.
            onChange(raw);
            return;
          }
          onChange(parsed);
        }}
      />
    </FieldShell>
  );
};
