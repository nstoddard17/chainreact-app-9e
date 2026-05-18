"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { useActiveNodeUpstreamVariables } from "../../hooks/useActiveNodeUpstreamVariables";
import { FieldShell } from "./FieldShell";
import { VariablePickerButton } from "./VariablePickerButton";
import { insertAtCursor } from "./_insertAtCursor";
import { validateReferences } from "./_variableValidator";
import type { FieldRendererProps } from "./types";

/**
 * `text` field renderer. Single-line text input.
 *
 * Value contract: string or undefined. Empty strings stay as empty
 * strings (the form layer decides whether to coerce to `undefined`
 * before save).
 *
 * Slice 3.7 — gains the variable-picker affordance:
 *   - A `{x}` icon button beside the input, hidden when there are
 *     no upstream sources (e.g. trigger-node config).
 *   - Click → popover tree of upstream node outputs.
 *   - Click an output → token inserted at the current cursor
 *     position in this input. Save flow is unchanged: the picker
 *     emits a string, the field's `onChange` fires, the configSlice
 *     draft accumulates the new value, and modal Save commits it.
 *   - Soft warnings surface inline below the input for unresolved
 *     `{{...}}` references (missing node / missing field). The
 *     parent `error` prop still wins — schema-level errors take
 *     priority. Save is NOT gated on these warnings — see
 *     `_variableValidator.ts` for the rationale.
 */

export const TextField: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
}) => {
  const stringValue = typeof value === "string" ? value : "";
  const controlId = `field-${field.name}`;
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const { sources, latestValuesBySource } = useActiveNodeUpstreamVariables();

  const warnings = React.useMemo(
    () => validateReferences({ value: stringValue, sources }),
    [stringValue, sources],
  );

  function handleInsertAtCursor(token: string): void {
    const el = inputRef.current;
    const { nextValue } = insertAtCursor({
      value: stringValue,
      insert: token,
      selectionStart: el?.selectionStart,
      selectionEnd: el?.selectionEnd,
    });
    onChange(nextValue);
  }

  return (
    <FieldShell
      controlId={controlId}
      label={field.label}
      required={field.required}
      description={field.description}
      error={error}
    >
      <div className="flex items-start gap-2">
        <Input
          ref={inputRef}
          id={controlId}
          name={field.name}
          value={stringValue}
          placeholder={field.placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? `${controlId}-err` : field.description ? `${controlId}-help` : undefined
          }
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <VariablePickerButton
          sources={sources}
          onInsertAtCursor={handleInsertAtCursor}
          ariaLabel={`Insert variable into ${field.label}`}
          testIdRoot={`text-${field.name}-picker`}
          latestValuesBySource={latestValuesBySource}
        />
      </div>
      {warnings.length > 0 ? (
        <ul
          className="mt-1 flex flex-col gap-0.5"
          data-testid={`field-${field.name}-warnings`}
        >
          {warnings.map((w) => (
            <li
              key={`${w.token}-${w.reason}`}
              role="status"
              className="text-xs text-warning-foreground"
            >
              {w.message}
            </li>
          ))}
        </ul>
      ) : null}
    </FieldShell>
  );
};
