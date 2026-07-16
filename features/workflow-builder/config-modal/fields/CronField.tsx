"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  computeUpcomingFireTimes,
  formatUtcFireTime,
  isValidCronExpression,
} from "@/core/triggers/cronHumanizer";
import {
  buildCronExpression,
  parseCronPreset,
  WEEKDAY_OPTIONS,
  type CronPreset,
  type CronPresetKind,
} from "./_cronPresets";
import { FieldShell } from "./FieldShell";
import type { FieldRendererProps } from "./types";

/**
 * `cron` field renderer — schedule preset builder over the same stored
 * 5-field UTC cron string (CONFIG-UX-SETUP-ADVANCED-1).
 *
 * A normal user picks WHAT they mean ("Every day at 09:00") from a
 * preset + native time/day inputs; the renderer commits the exact cron
 * string the runtime schema always validated. A power user picks
 * "Custom (cron)" and gets the original raw input, with the same
 * inline validity hint + "runs next at" preview (Slice 3.3).
 *
 * Hydration rules (see `_cronPresets.ts`):
 *   - A saved expression matching a builder-emitted shape hydrates into
 *     its preset controls.
 *   - Anything else (steps, lists, ranges) hydrates as Custom with the
 *     raw string intact — an unfamiliar expression is never rewritten.
 *
 * All times are UTC (the scheduler's clock); the preview shows the next
 * fire instants in UTC plus the viewer's local time so "9:00 UTC" is
 * never a surprise.
 */

const KIND_LABEL: Record<Exclude<CronPresetKind, "custom">, string> = {
  hourly: "Every hour",
  daily: "Every day",
  weekdays: "Weekdays (Mon–Fri)",
  weekly: "Every week",
  monthly: "Every month",
};

const DEFAULT_BY_KIND: Record<Exclude<CronPresetKind, "custom">, CronPreset> = {
  hourly: { kind: "hourly", minute: 0 },
  daily: { kind: "daily", hour: 9, minute: 0 },
  weekdays: { kind: "weekdays", hour: 9, minute: 0 },
  weekly: { kind: "weekly", dayOfWeek: 1, hour: 9, minute: 0 },
  monthly: { kind: "monthly", dayOfMonth: 1, hour: 9, minute: 0 },
};

function toTimeInputValue(hour: number, minute: number): string {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return `${hh}:${mm}`;
}

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

  // "Custom (cron)" can be chosen explicitly even while the current
  // expression still matches a preset shape; cleared when the user picks
  // a preset again.
  const [forcedCustom, setForcedCustom] = React.useState(false);

  const parsed = React.useMemo(() => parseCronPreset(trimmedValue), [trimmedValue]);
  const hasValue = trimmedValue.length > 0;
  const effectiveKind: CronPresetKind | "" = forcedCustom
    ? "custom"
    : hasValue
      ? parsed.kind
      : "";

  // useMemo on the trimmed value alone — `new Date()` is captured fresh
  // each render so the preview reflects the latest "now" without ticking.
  const preview = React.useMemo(() => {
    if (trimmedValue.length === 0) return null;
    if (!isValidCronExpression(trimmedValue)) {
      return { kind: "invalid" as const };
    }
    const fires = computeUpcomingFireTimes(trimmedValue, new Date(), 2);
    if (!fires || fires.length === 0) return null;
    return { kind: "valid" as const, fires };
  }, [trimmedValue]);

  function commitPreset(preset: Exclude<CronPreset, { kind: "custom" }>): void {
    onChange(buildCronExpression(preset));
  }

  function handleKindChange(next: string): void {
    if (next === "custom") {
      setForcedCustom(true);
      return;
    }
    setForcedCustom(false);
    const kind = next as Exclude<CronPresetKind, "custom">;
    // Carry the time-of-day across preset switches where both sides have
    // one; otherwise start from the kind's sensible default (visible
    // immediately in the controls + preview — nothing silent).
    const base = DEFAULT_BY_KIND[kind];
    const carried: CronPreset =
      "hour" in base && parsed.kind !== "custom" && "hour" in parsed
        ? { ...base, hour: parsed.hour, minute: parsed.minute }
        : parsed.kind === "hourly" && base.kind === "hourly"
          ? parsed
          : base;
    commitPreset(carried as Exclude<CronPreset, { kind: "custom" }>);
  }

  const showCustomInput = effectiveKind === "custom";

  return (
    <FieldShell
      controlId={controlId}
      label={field.label}
      required={field.required}
      description={
        field.description ??
        "When to run. Times are in UTC — the preview below shows your local time."
      }
      error={error}
    >
      <div className="flex flex-col gap-2" data-testid="cron-schedule-builder">
        <Select
          value={effectiveKind}
          onValueChange={handleKindChange}
          disabled={disabled}
        >
          <SelectTrigger
            id={controlId}
            aria-label={field.label}
            data-testid="cron-preset-kind"
          >
            <SelectValue placeholder="Choose when to run…" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(KIND_LABEL) as Array<Exclude<CronPresetKind, "custom">>).map(
              (kind) => (
                <SelectItem key={kind} value={kind}>
                  {KIND_LABEL[kind]}
                </SelectItem>
              ),
            )}
            <SelectItem value="custom">Custom (cron)</SelectItem>
          </SelectContent>
        </Select>

        {parsed.kind === "hourly" && !forcedCustom ? (
          <label className="flex items-center gap-2 text-xs">
            At minute
            <Input
              type="number"
              min={0}
              max={59}
              step={1}
              aria-label="Minute of each hour (UTC)"
              className="w-20"
              value={String(parsed.minute)}
              disabled={disabled}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 0 && n <= 59) {
                  commitPreset({ kind: "hourly", minute: n });
                }
              }}
            />
            of every hour
          </label>
        ) : null}

        {!forcedCustom &&
        (parsed.kind === "daily" ||
          parsed.kind === "weekdays" ||
          parsed.kind === "weekly" ||
          parsed.kind === "monthly") ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {parsed.kind === "weekly" ? (
              <Select
                value={String(parsed.dayOfWeek)}
                onValueChange={(v) =>
                  commitPreset({ ...parsed, dayOfWeek: Number(v) })
                }
                disabled={disabled}
              >
                <SelectTrigger
                  aria-label="Day of the week"
                  className="w-36"
                  data-testid="cron-weekday"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAY_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={String(d.value)}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {parsed.kind === "monthly" ? (
              <label className="flex items-center gap-2">
                On day
                <Input
                  type="number"
                  min={1}
                  max={31}
                  step={1}
                  aria-label="Day of the month"
                  className="w-20"
                  value={String(parsed.dayOfMonth)}
                  disabled={disabled}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isInteger(n) && n >= 1 && n <= 31) {
                      commitPreset({ ...parsed, dayOfMonth: n });
                    }
                  }}
                />
              </label>
            ) : null}
            <label className="flex items-center gap-2">
              At
              <Input
                type="time"
                aria-label="Time of day (UTC)"
                className="w-32"
                value={toTimeInputValue(parsed.hour, parsed.minute)}
                disabled={disabled}
                onChange={(e) => {
                  const [hh, mm] = e.target.value.split(":");
                  const hour = Number(hh);
                  const minute = Number(mm);
                  if (
                    Number.isInteger(hour) &&
                    Number.isInteger(minute) &&
                    hour >= 0 &&
                    hour <= 23 &&
                    minute >= 0 &&
                    minute <= 59
                  ) {
                    commitPreset({ ...parsed, hour, minute });
                  }
                }}
              />
              UTC
            </label>
            {parsed.kind === "monthly" && parsed.dayOfMonth > 28 ? (
              <p className="w-full text-[11px] text-muted-foreground">
                Months without day {parsed.dayOfMonth} are skipped.
              </p>
            ) : null}
          </div>
        ) : null}

        {showCustomInput ? (
          <Input
            name={field.name}
            type="text"
            aria-label="Custom cron expression"
            value={stringValue}
            placeholder={field.placeholder ?? "0 9 * * 1-5"}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            aria-invalid={error ? true : undefined}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="font-mono"
          />
        ) : null}

        <CronPreview controlId={controlId} preview={preview} />
      </div>
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
  const localHint = first
    ? first.toLocaleString(undefined, {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
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
      {localHint ? <> ({localHint} your local time)</> : null}.
    </p>
  );
}
