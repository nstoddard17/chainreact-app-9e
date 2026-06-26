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
import type { FieldRendererProps } from "./types";

/**
 * `select` field renderer. Static options only — `optionsSource` is a
 * field-meta concern handled by the future Slice 3.4 provider-config
 * wrappers (where channel / repo / table lists arrive from server
 * endpoints).
 *
 * Multi-select is NOT supported by this renderer; FieldMeta.multiple
 * on a `select` would need a different shape. We surface a clear error
 * for that case at render time so a meta drift never silently downgrades
 * to single-select.
 */

export const SelectField: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
}) => {
  const stringValue = typeof value === "string" ? value : "";
  const controlId = `field-${field.name}`;

  if (field.multiple) {
    return (
      <FieldShell
        controlId={controlId}
        label={field.label}
        required={field.required}
        description={field.description}
        error={`Multi-select on type 'select' is not supported by this renderer. Mark the field as 'combobox' + multiple, or drop multiple.`}
      >
        <Select value={stringValue} disabled>
          <SelectTrigger id={controlId} aria-invalid />
        </Select>
      </FieldShell>
    );
  }

  if (!field.options || field.options.length === 0) {
    return (
      <FieldShell
        controlId={controlId}
        label={field.label}
        required={field.required}
        description={field.description}
        error="No options available. Select fields require static `options` or an option source provider config wrapper."
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
