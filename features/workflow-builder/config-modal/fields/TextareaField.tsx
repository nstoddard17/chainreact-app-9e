"use client";

import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { FieldShell } from "./FieldShell";
import type { FieldRendererProps } from "./types";

/**
 * `textarea` field renderer. Multi-line text input.
 *
 * Default rows = 4 (compact V1 density). For really large fields (HTTP
 * body, gist content, etc.) the textarea auto-grows up to its max-height
 * via standard browser behavior.
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
  return (
    <FieldShell
      controlId={controlId}
      label={field.label}
      required={field.required}
      description={field.description}
      error={error}
    >
      <Textarea
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
      />
    </FieldShell>
  );
};
