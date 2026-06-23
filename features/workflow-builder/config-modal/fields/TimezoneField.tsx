"use client";

import * as React from "react";
import { FieldShell } from "./FieldShell";
import { listTimezones } from "./_temporal";
import type { FieldRendererProps } from "./types";

/**
 * `timezone` field renderer (CS-1). Native `<select>` of IANA time-zone names,
 * provider-agnostic. Stores the IANA string (e.g. "America/New_York") — exactly
 * what handler schemas expect (e.g. Google Calendar `timezone`, optional).
 *
 * - Hydrates the current value; an unknown / legacy stored value is preserved
 *   by prepending it as a selectable option (never dropped).
 * - Optional fields keep a blank first option so the user can clear back to the
 *   provider default (clearing emits `undefined`).
 * - Native select → keyboard accessible + type-ahead for free.
 */
export const TimezoneField: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
}) => {
  const stringValue = typeof value === "string" ? value : "";
  const controlId = `field-${field.name}`;

  const zones = React.useMemo(() => {
    const list = listTimezones();
    // Preserve an unknown/legacy stored value so it still hydrates + round-trips.
    if (stringValue && !list.includes(stringValue)) return [stringValue, ...list];
    return list;
  }, [stringValue]);

  return (
    <FieldShell
      controlId={controlId}
      label={field.label}
      required={field.required}
      description={field.description}
      error={error}
    >
      <select
        id={controlId}
        name={field.name}
        data-testid={`timezone-${field.name}`}
        value={stringValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error ? `${controlId}-err` : field.description ? `${controlId}-help` : undefined
        }
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="">
          {field.required ? "Select a time zone…" : field.placeholder ?? "Default (UTC)"}
        </option>
        {zones.map((tz) => (
          <option key={tz} value={tz}>
            {tz}
          </option>
        ))}
      </select>
    </FieldShell>
  );
};
