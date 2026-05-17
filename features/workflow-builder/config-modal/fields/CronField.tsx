"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { FieldShell } from "./FieldShell";
import type { FieldRendererProps } from "./types";

/**
 * `cron` field renderer — styled text input for 5-field UTC cron
 * expressions.
 *
 * Slice 3.1 scope: typing + validation surface only. The cron
 * humanizer ("Runs every weekday at 9am") lands in Slice 3.3 alongside
 * the scheduled-trigger UX. The `cron-parser` dep is already in
 * package.json so adding the humanizer later is a small follow-up.
 */

export const CronField: React.FC<FieldRendererProps> = ({
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
      description={
        field.description
          ? `${field.description} (Humanized preview arrives with the scheduled-trigger UI.)`
          : "5-field UTC cron expression (minute hour day-of-month month day-of-week)."
      }
      error={error}
    >
      <Input
        id={controlId}
        name={field.name}
        type="text"
        value={stringValue}
        placeholder={field.placeholder ?? "0 9 * * 1-5"}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error ? `${controlId}-err` : field.description ? `${controlId}-help` : undefined
        }
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono"
      />
    </FieldShell>
  );
};
