"use client";

import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { useActiveNodeUpstreamVariables } from "../../hooks/useActiveNodeUpstreamVariables";
import { FieldShell } from "./FieldShell";
import { VariablePickerButton } from "./VariablePickerButton";
import { insertAtCursor } from "./_insertAtCursor";
import { validateReferences } from "./_variableValidator";
import type { FieldRendererProps } from "./types";

/**
 * `textarea` field renderer. Multi-line text input.
 *
 * Default rows = 4 (compact V1 density). For really large fields (HTTP
 * body, gist content, etc.) the textarea auto-grows up to its max-height
 * via standard browser behavior.
 *
 * Slice 3.7 — gains the variable-picker affordance (same shape as
 * `TextField`). The picker uses the standard
 * `selectionStart`/`selectionEnd` API which both `<input>` and
 * `<textarea>` support, so insertion logic is shared verbatim via
 * `insertAtCursor`. Soft warnings render below the textarea.
 */

export const TextareaField: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
}) => {
  const stringValue = typeof value === "string" ? value : "";
  const controlId = `field-${field.name}`;
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const { sources, latestValuesBySource } = useActiveNodeUpstreamVariables();

  const warnings = React.useMemo(
    () => validateReferences({ value: stringValue, sources }),
    [stringValue, sources],
  );

  function handleInsertAtCursor(token: string): void {
    const el = textareaRef.current;
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
        <Textarea
          ref={textareaRef}
          id={controlId}
          name={field.name}
          rows={4}
          value={stringValue}
          placeholder={field.placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? `${controlId}-err` : field.description ? `${controlId}-help` : undefined
          }
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1"
        />
        <VariablePickerButton
          sources={sources}
          onInsertAtCursor={handleInsertAtCursor}
          ariaLabel={`Insert variable into ${field.label}`}
          testIdRoot={`textarea-${field.name}-picker`}
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
