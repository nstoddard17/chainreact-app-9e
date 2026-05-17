"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { FieldShell } from "./FieldShell";
import type { FieldRendererProps } from "./types";

/**
 * `text` field renderer. Single-line text input.
 *
 * Value contract: string or undefined. Empty strings stay as empty
 * strings (the form layer decides whether to coerce to `undefined`
 * before save).
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
