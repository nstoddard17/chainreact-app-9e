"use client";

import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { useActiveNodeUpstreamVariables } from "../../hooks/useActiveNodeUpstreamVariables";
import { FieldShell } from "./FieldShell";
import { VariablePickerButton } from "./VariablePickerButton";
import {
  jsonFieldValueToText,
  validateJsonFieldText,
  type JsonShape,
} from "./_jsonFieldValue";
import type { FieldRendererProps } from "./types";

/**
 * `json` field renderer (CONFIG-UX-AUDIT-2) — the advanced developer JSON
 * escape hatch, made runtime-correct.
 *
 * AUDIT-1's advanced textareas saved the literal STRING the user typed;
 * object/array-expecting runtime schemas (`z.array`/`z.object`/`z.record`)
 * rejected it at activation/run. This renderer:
 *
 *   - keeps the RAW editor text in local state, so invalid JSON never
 *     destroys what the user typed;
 *   - commits the PARSED value (array/object per `field.jsonShape`) when
 *     the text is valid JSON of the right shape;
 *   - commits the string as-is when it is a pure `{{...}}` variable
 *     reference (the runtime resolver replaces a standalone token with
 *     the referenced raw value);
 *   - commits the raw string for invalid/mismatched text, which the
 *     config modal's Save gate (`collectJsonFieldBlockingError`) turns
 *     into a blocked Save with the same friendly message shown inline
 *     here — nothing typed is lost, nothing broken is saved;
 *   - commits `undefined` when cleared.
 *
 * Errors are product copy only ("This needs valid JSON…", "This field
 * needs a list…"). Parser exceptions, Zod internals, and renderer names
 * never render. Variables must reference the WHOLE value — mixed
 * JSON+variable text is rejected with copy explaining that rule.
 *
 * The variable picker REPLACES the whole value with the picked token
 * (matching the whole-value rule), rather than inserting at the cursor.
 */

export const JsonField: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
}) => {
  const controlId = `field-${field.name}`;
  const shape: JsonShape = field.jsonShape ?? "any";
  const { sources, latestValuesBySource } = useActiveNodeUpstreamVariables();

  // Local raw editor text. Initialized from the committed value; the
  // modal remounts renderers per node open, so external resets re-hydrate.
  const [text, setText] = React.useState<string>(() => jsonFieldValueToText(value));

  const validation = React.useMemo(
    () => validateJsonFieldText(text, shape),
    [text, shape],
  );

  function handleTextChange(next: string): void {
    setText(next);
    const result = validateJsonFieldText(next, shape);
    // Valid → commit the parsed value / pure variable / undefined.
    // Invalid → commit the raw string so the draft round-trips the user's
    // typing AND the Save gate blocks on it.
    onChange(result.error === null ? result.committed : next);
  }

  function setToVariable(token: string): void {
    setText(token);
    onChange(token);
  }

  const inlineError = error ?? validation.error ?? undefined;

  return (
    <FieldShell
      controlId={controlId}
      label={field.label}
      required={field.required}
      description={field.description}
      error={inlineError}
    >
      <div className="flex items-start gap-2">
        <Textarea
          id={controlId}
          name={field.name}
          rows={4}
          value={text}
          placeholder={field.placeholder}
          aria-invalid={inlineError ? true : undefined}
          aria-describedby={
            inlineError
              ? `${controlId}-err`
              : field.description
                ? `${controlId}-help`
                : undefined
          }
          disabled={disabled}
          onChange={(e) => handleTextChange(e.target.value)}
          spellCheck={false}
          className="flex-1 font-mono text-xs"
          data-testid={`json-field-${field.name}`}
        />
        <VariablePickerButton
          sources={sources}
          onInsertAtCursor={setToVariable}
          ariaLabel={`Insert variable into ${field.label}`}
          testIdRoot={`json-${field.name}-picker`}
          latestValuesBySource={latestValuesBySource}
        />
      </div>
    </FieldShell>
  );
};
