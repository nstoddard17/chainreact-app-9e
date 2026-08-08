"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { useActiveNodeUpstreamVariables } from "../../hooks/useActiveNodeUpstreamVariables";
import { FieldShell } from "./FieldShell";
import { VariablePickerButton } from "./VariablePickerButton";
import { insertAtCursor } from "./_insertAtCursor";
import { validateReferences } from "./_variableValidator";
import { describePrefillSource } from "./_prefillSource";
import { FieldSetupHint } from "./FieldSetupHint";
import { ResourcePickerButton } from "./ResourcePickerButton";
import { classifyConfigFieldValue } from "@/core/workflows/configFieldClassification";
import { useGraphSlice } from "../../state/graphSlice";
import { useConfigSlice } from "../../state/configSlice";
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
 *
 * GOOGLE-OAUTH-PRODUCTION-SCOPE-CLOSEOUT-2 — when the field declares
 * `resourcePicker`, a "Choose from Google Drive" button renders beside
 * the input. Picking commits the provider's stable resource id to the
 * SAME value the schema already expects, so nothing downstream changes.
 * The input stays editable on purpose: pasting a known id and mapping
 * an upstream `{{...}}` variable both keep working, and the field can
 * never be stranded if the picker is unavailable.
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

  // Threaded to the picker-session route so the server applies the same
  // credential-sharing policy the options resolver uses (account-shared vs
  // creator-pinned, accepted per-node owner). Never trusted from the client.
  const workflowId = useGraphSlice((s) => s.workflowId) ?? undefined;
  const nodeId = useConfigSlice((s) => s.activeNodeId) ?? undefined;

  const warnings = React.useMemo(
    () => validateReferences({ value: stringValue, sources }),
    [stringValue, sources],
  );

  // Plain-English setup state (pure) + friendly source label for prefilled fields.
  const setupState = React.useMemo(
    () =>
      classifyConfigFieldValue({
        value: stringValue,
        required: field.required,
        hasUnresolvedReference: warnings.length > 0,
      }),
    [stringValue, field.required, warnings.length],
  );
  const sourceLabel = React.useMemo(
    () => describePrefillSource({ value: stringValue, sources }),
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
      {field.resourcePicker ? (
        <div className="mt-1.5">
          <ResourcePickerButton
            picker={field.resourcePicker}
            fieldLabel={field.label}
            fieldName={field.name}
            workflowId={workflowId}
            nodeId={nodeId}
            disabled={disabled}
            onPicked={(resourceId) => onChange(resourceId)}
          />
        </div>
      ) : null}
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
      {error ? null : (
        <FieldSetupHint
          state={setupState}
          fieldLabel={field.label}
          sourceLabel={sourceLabel}
        />
      )}
    </FieldShell>
  );
};
