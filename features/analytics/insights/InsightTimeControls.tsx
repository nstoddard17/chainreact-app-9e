"use client";

import type { AnalyticsRange } from "@/contracts/analytics";
import { compareAllowed, type InsightDataset, type InsightMeasure } from "./insightCatalog";
import type { InsightDraft } from "./reconcileInsightConfig";
import { RANGE_OPTIONS } from "../dashboardHelpers";

/**
 * Time controls (CD-3A): the existing range presets plus a native custom
 * date range (already supported by the connected contract), time grouping
 * (auto/day/week/month) for line charts, a date-field choice when the
 * dataset declares more than one, and previous-period comparison where the
 * catalog allows it. Rendered only for historical datasets.
 */

const GRAIN_OPTIONS: { id: InsightDraft["timeGrain"]; label: string }[] = [
  { id: "auto", label: "Automatic" },
  { id: "day", label: "Daily" },
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
];

export function InsightTimeControls({
  dataset,
  measure,
  draft,
  onPatch,
}: {
  dataset: InsightDataset;
  measure: InsightMeasure;
  draft: InsightDraft;
  onPatch: (patch: Partial<InsightDraft>) => void;
}) {
  if (dataset.dateFields.length === 0) return null;
  const isTime = draft.dimension === "time";
  const custom = "from" in draft.range ? draft.range : null;
  const canCompare = compareAllowed(dataset, measure, draft.dimension, draft.series !== null);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-1">
        {RANGE_OPTIONS.map((r) => {
          const on = !custom && "preset" in draft.range && draft.range.preset === r.id;
          return (
            <RangeChip
              key={r.id}
              label={r.label}
              on={on}
              onSelect={() => onPatch({ range: { preset: r.id as AnalyticsRange } })}
            />
          );
        })}
        <RangeChip
          label="Custom"
          on={custom !== null}
          onSelect={() => {
            if (!custom) {
              const to = new Date();
              const from = new Date(to.getTime() - 29 * 86_400_000);
              onPatch({
                range: {
                  from: from.toISOString().slice(0, 10),
                  to: to.toISOString().slice(0, 10),
                },
              });
            }
          }}
        />
      </div>

      {custom && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-foreground/85">
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">From</span>
            <input
              type="date"
              className="rounded-md border border-border bg-muted px-2 py-1 text-[12px] text-foreground outline-none"
              value={custom.from}
              onChange={(e) => onPatch({ range: { from: e.target.value, to: custom.to } })}
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">To</span>
            <input
              type="date"
              className="rounded-md border border-border bg-muted px-2 py-1 text-[12px] text-foreground outline-none"
              value={custom.to}
              onChange={(e) => onPatch({ range: { from: custom.from, to: e.target.value } })}
            />
          </label>
          <span className="text-[10.5px] text-muted-foreground">
            Up to {dataset.limits.maxRangeDays} days
          </span>
        </div>
      )}

      {isTime && (
        <label className="flex items-center gap-2 text-[12px] text-foreground/85">
          <span className="text-muted-foreground">Group by</span>
          <select
            className="rounded-md border border-border bg-muted px-2 py-1 text-[12px] text-foreground outline-none"
            value={draft.timeGrain}
            onChange={(e) => onPatch({ timeGrain: e.target.value as InsightDraft["timeGrain"] })}
          >
            {GRAIN_OPTIONS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
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
        <label className="flex items-center gap-2 text-[12px] text-foreground/85">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
            checked={draft.compare}
            onChange={(e) => onPatch({ compare: e.target.checked })}
          />
          <span>Compare with the previous period</span>
        </label>
      )}
    </div>
  );
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
