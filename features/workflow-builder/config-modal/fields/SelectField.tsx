"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldShell } from "./FieldShell";
import { FieldSetupHint } from "./FieldSetupHint";
import { classifyConfigFieldValue } from "@/core/workflows/configFieldClassification";
import { MultiOptionsField } from "./MultiOptionsField";
import type { FieldRendererProps } from "./types";

/**
 * `select` field renderer. Static options only — `optionsSource` is a
 * field-meta concern handled by the future Slice 3.4 provider-config
 * wrappers (where channel / repo / table lists arrive from server
 * endpoints).
 *
 * Multi-select (`FieldMeta.multiple`) delegates to MultiOptionsField
 * (CONFIG-UX-AUDIT-1) — value is `string[]`. Meta drift (e.g. missing
 * options) renders friendly copy only; internal diagnostics live in
 * tests, never in the author-facing panel.
 */

export const SelectField: React.FC<FieldRendererProps> = (props) => {
  if (props.field.multiple) {
    return <MultiOptionsField {...props} />;
  }
  return <SingleSelectBody {...props} />;
};

const SingleSelectBody: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
}) => {
  const stringValue = typeof value === "string" ? value : "";
  const controlId = `field-${field.name}`;

  if (!field.options || field.options.length === 0) {
    return (
      <FieldShell
        controlId={controlId}
        label={field.label}
        required={field.required}
        description={field.description}
        error="The choices for this field aren't available right now. Try reopening this step, or contact support if it keeps happening."
      >
        <Select value={stringValue} disabled>
          <SelectTrigger id={controlId} aria-invalid />
        </Select>
      </FieldShell>
    );
  }

  return (
    <FieldShell
      controlId={controlId}
      label={field.label}
      required={field.required}
      description={field.description}
      error={error}
    >
      <Select value={stringValue} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          id={controlId}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? `${controlId}-err` : field.description ? `${controlId}-help` : undefined
          }
        >
          <SelectValue placeholder={field.placeholder ?? "Choose..."} />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? null : (
        <FieldSetupHint
          state={classifyConfigFieldValue({ value: stringValue, required: field.required })}
          fieldLabel={field.label}
        />
      )}
    </FieldShell>
  );
};
