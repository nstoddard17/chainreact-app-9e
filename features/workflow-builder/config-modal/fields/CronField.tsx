"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import {
  computeUpcomingFireTimes,
  formatUtcFireTime,
  isValidCronExpression,
} from "@/core/triggers/cronHumanizer";
import { FieldShell } from "./FieldShell";
import type { FieldRendererProps } from "./types";

/**
 * `cron` field renderer — styled text input for 5-field UTC cron
 * expressions, with an inline humanizer.
 *
 * Slice 3.1 shipped the typing surface; Slice 3.3 wires the humanizer
 * via `core/triggers/cronHumanizer` so authors get same-keystroke
 * feedback on validity + the next two scheduled fire instants. The
 * humanizer is intentionally "next fires" rather than a full English
 * description — a true `cronstrue`-style sentence ("every weekday at
 * 9am UTC") would need an extra dep, and "Runs next at … then …" is
 * arguably more diagnostic anyway.
 *
 * The author sees one of three states below the input:
 *   - Empty value → the field's description (placeholder hint).
 *   - Invalid expression → red "Invalid cron expression" hint (does NOT
 *     replace the slice-level `error` prop — the schema's authoritative
 *     validation runs at save time and surfaces through `error` like
 *     any other field).
 *   - Valid expression → "Runs next at <UTC> and again on <UTC>".
 *
 * "Now" is captured once per render so previews don't tick. The
 * recompute is gated to non-empty + valid expressions so we don't burn
 * a parse on every keystroke.
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
  const trimmedValue = stringValue.trim();

  // useMemo on stringValue alone — `Date.now()` is captured fresh each
  // render so the preview reflects the latest "now" without ticking.
  const preview = React.useMemo(() => {
    if (trimmedValue.length === 0) return null;
    if (!isValidCronExpression(trimmedValue)) {
      return { kind: "invalid" as const };
    }
    const fires = computeUpcomingFireTimes(trimmedValue, new Date(), 2);
    if (!fires || fires.length === 0) return null;
    return { kind: "valid" as const, fires };
  }, [trimmedValue]);

  return (
    <FieldShell
      controlId={controlId}
      label={field.label}
      required={field.required}
      description={
        field.description ??
        "5-field UTC cron expression (minute hour day-of-month month day-of-week)."
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
          error
            ? `${controlId}-err`
            : preview
              ? `${controlId}-cron-preview`
              : field.description
                ? `${controlId}-help`
                : undefined
        }
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono"
      />
      <CronPreview controlId={controlId} preview={preview} />
    </FieldShell>
  );
};

interface CronPreviewProps {
  controlId: string;
  preview:
    | { kind: "invalid" }
    | { kind: "valid"; fires: readonly Date[] }
    | null;
}

function CronPreview({ controlId, preview }: CronPreviewProps) {
  if (!preview) return null;
  if (preview.kind === "invalid") {
    return (
      <p
        id={`${controlId}-cron-preview`}
        className="text-xs text-destructive"
        role="status"
      >
        Invalid cron expression. Expected 5 fields (minute hour
        day-of-month month day-of-week), UTC only — presets like
        <code className="mx-1 font-mono">@hourly</code>
        are not supported.
      </p>
    );
  }
  const [first, second] = preview.fires;
  return (
    <p
      id={`${controlId}-cron-preview`}
      className="text-xs text-muted-foreground"
      role="status"
      data-testid="cron-preview"
    >
      Runs next at <span className="font-mono">{formatUtcFireTime(first!)}</span>
      {second ? (
        <>
          , then{" "}
          <span className="font-mono">{formatUtcFireTime(second)}</span>
        </>
      ) : null}
      .
    </p>
  );
}
