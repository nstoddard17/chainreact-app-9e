"use client";

import {
  availableGrains,
  customRangeWindow,
  describeWindow,
  presetsWithinLimit,
  previousPeriodWindow,
  rangeSpanDays,
  resolvePresetWindow,
  validateCustomRange,
  type InsightGrain,
} from "@/core/analytics/insightRange";
import { compareAllowed, type InsightDataset, type InsightMeasure } from "./insightCatalog";
import type { InsightDraft } from "./reconcileInsightConfig";

/**
 * Time controls (CD-3A, finished in CD-5A).
 *
 * Everything here is catalog-driven — presets are filtered by the dataset's own
 * `maxRangeDays`, grains by the span the user actually picked, and the compare
 * control by the measure's declared capability. There is no provider name in
 * this file, and a current-state measure never reaches it (the whole step is
 * hidden when the dataset declares no historical date field).
 *
 * The date language is deliberately plain: the end date is INCLUSIVE ("both
 * dates are included"), and the resolved window is echoed back under the
 * control, so nobody has to reason about UTC or half-open intervals to trust
 * the chart.
 */

const GRAIN_LABELS: Record<InsightGrain, string> = {
  auto: "Automatic",
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
};

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function InsightTimeControls({
  dataset,
  measure,
  draft,
  onPatch,
  now = Date.now(),
}: {
  dataset: InsightDataset;
  measure: InsightMeasure;
  draft: InsightDraft;
  onPatch: (patch: Partial<InsightDraft>) => void;
  /** Injected clock so resolved-range copy is deterministic under test. */
  now?: number;
}) {
  if (dataset.dateFields.length === 0) return null;
  const isTime = draft.dimension === "time";
  const custom = "from" in draft.range ? draft.range : null;
  const canCompare = compareAllowed(dataset, measure, draft.dimension, draft.series !== null);
  const maxRangeDays = dataset.limits.maxRangeDays;

  const presets = presetsWithinLimit(maxRangeDays);
  const rangeError = custom ? validateCustomRange(custom.from, custom.to, maxRangeDays) : null;

  // The window this range actually covers — echoed so the dates are never a
  // guess. Null while a custom range is incomplete or invalid.
  const window =
    "from" in draft.range
      ? rangeError
        ? null
        : customRangeWindow(draft.range.from, draft.range.to)
      : resolvePresetWindow(draft.range.preset, now);

  const spanDays = rangeSpanDays(draft.range, now);
  const grains: readonly InsightGrain[] = spanDays === null ? ["auto"] : availableGrains(spanDays);

  return (
    <div className="flex flex-col gap-2.5">
      <fieldset className="flex flex-col gap-1.5 border-0 p-0">
        <legend className="sr-only">Date range</legend>
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => {
            const on = !custom && "preset" in draft.range && draft.range.preset === p.id;
            return (
              <RangeChip
                key={p.id}
                label={p.label}
                on={on}
                onSelect={() => onPatch({ range: { preset: p.id } })}
              />
            );
          })}
          <RangeChip
            label="Custom"
            on={custom !== null}
            onSelect={() => {
              if (!custom) {
                // A 30-day window ending TODAY — and because the end date is
                // inclusive, today is genuinely included (it was not before).
                onPatch({
                  range: { from: isoDate(now - 29 * 86_400_000), to: isoDate(now) },
                });
              }
            }}
          />
        </div>
      </fieldset>

      {custom && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-foreground/85">
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Start date</span>
              <input
                type="date"
                aria-describedby="insight-range-help"
                aria-invalid={rangeError !== null}
                className="rounded-md border border-border bg-muted px-2 py-1 text-[12px] text-foreground outline-none"
                value={custom.from}
                onChange={(e) => onPatch({ range: { from: e.target.value, to: custom.to } })}
              />
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">End date</span>
              <input
                type="date"
                aria-describedby="insight-range-help"
                aria-invalid={rangeError !== null}
                className="rounded-md border border-border bg-muted px-2 py-1 text-[12px] text-foreground outline-none"
                value={custom.to}
                onChange={(e) => onPatch({ range: { from: custom.from, to: e.target.value } })}
              />
            </label>
          </div>
          <p id="insight-range-help" className="text-[10.5px] text-muted-foreground">
            Both dates are included. Up to {maxRangeDays} days at a time.
          </p>
          {rangeError && (
            <p className="text-[10.5px] text-destructive" role="alert">
              {rangeError}
            </p>
          )}
        </div>
      )}

      {window && (
        <p className="text-[10.5px] text-muted-foreground" role="note">
          Showing {describeWindow(window.fromMs, window.toMs)} (UTC)
        </p>
      )}

      {isTime && (
        <label className="flex flex-wrap items-center gap-2 text-[12px] text-foreground/85">
          <span className="text-muted-foreground">Group by</span>
          <select
            className="rounded-md border border-border bg-muted px-2 py-1 text-[12px] text-foreground outline-none"
            value={draft.timeGrain}
            aria-describedby="insight-grain-help"
            onChange={(e) => onPatch({ timeGrain: e.target.value as InsightDraft["timeGrain"] })}
          >
            {grains.map((g) => (
              <option key={g} value={g}>
                {GRAIN_LABELS[g]}
              </option>
            ))}
          </select>
          <span id="insight-grain-help" className="text-[10.5px] text-muted-foreground">
            Automatic picks a readable grouping for the dates you chose.
          </span>
        </label>
      )}

      {isTime && dataset.dateFields.length > 1 && (
        <label className="flex items-center gap-2 text-[12px] text-foreground/85">
          <span className="text-muted-foreground">Date to use</span>
          <select
            className="rounded-md border border-border bg-muted px-2 py-1 text-[12px] text-foreground outline-none"
            value={draft.dateField ?? dataset.dateFields[0]!.id}
            onChange={(e) => onPatch({ dateField: e.target.value })}
          >
            {dataset.dateFields.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {canCompare && (
        <div className="flex flex-col gap-0.5">
          <label className="flex items-center gap-2 text-[12px] text-foreground/85">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
              checked={draft.compare}
              onChange={(e) => onPatch({ compare: e.target.checked })}
            />
            <span>Compare with the previous period</span>
          </label>
          {draft.compare && window && (
            <p className="pl-[22px] text-[10.5px] text-muted-foreground" role="note">
              Compared with {describePreviousWindow(window.fromMs, window.toMs)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function describePreviousWindow(fromMs: number, toMs: number): string {
  const prev = previousPeriodWindow(fromMs, toMs);
  return describeWindow(prev.fromMs, prev.toMs);
}

function RangeChip({
  label,
  on,
  onSelect,
}: {
  label: string;
  on: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={
        "rounded-md border px-2 py-1 text-[11.5px] " +
        (on
          ? "border-primary bg-primary/15 font-medium text-primary"
          : "border-border bg-muted text-muted-foreground hover:text-foreground")
      }
      onClick={onSelect}
    >
      {label}
    </button>
  );
}
