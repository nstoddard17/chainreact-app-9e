"use client";

import {
  availableSeries,
  seriesDimension,
  type InsightDataset,
  type InsightMeasure,
  type InsightSource,
} from "./insightCatalog";
import type { InsightDraft } from "./reconcileInsightConfig";
import { InsightEntityPicker, type InsightEntityOption } from "./InsightEntityPicker";

/**
 * "What should get its own line?" (CD-3A) — series controls generated from
 * the dataset's declared series capabilities, filtered to the measure.
 * Modes come from the capability: automatic (empty modes), Top N, or an
 * explicit selection through the generic entity picker — exact items are one
 * entity-series experience, not a workflow-specific concept.
 */
export function InsightSeriesControls({
  source,
  dataset,
  measure,
  series,
  onChange,
  internalEntityOptions,
}: {
  source: InsightSource;
  dataset: InsightDataset;
  measure: InsightMeasure;
  series: InsightDraft["series"];
  onChange: (series: InsightDraft["series"]) => void;
  internalEntityOptions: readonly InsightEntityOption[];
}) {
  const caps = availableSeries(dataset, measure);
  if (caps.length === 0) return null;

  type Choice = { key: string; label: string; make: () => NonNullable<InsightDraft["series"]> };
  const choices: Choice[] = [];
  for (const cap of caps) {
    const dim = seriesDimension(dataset, cap);
    const dimLabel = dim?.label ?? cap.by;
    if (cap.modes.length === 0) {
      choices.push({
        key: `${cap.by}:auto`,
        label: `By ${dimLabel.toLowerCase()} (automatic)`,
        make: () => ({ by: cap.by }),
      });
    }
    if (cap.modes.includes("top")) {
      choices.push({
        key: `${cap.by}:top`,
        label: `Busiest ${dimLabel.toLowerCase()}s`,
        make: () => ({ by: cap.by, mode: "top", topN: Math.min(5, cap.max) }),
      });
    }
    if (cap.modes.includes("explicit")) {
      choices.push({
        key: `${cap.by}:explicit`,
        label: `Choose exact ${dimLabel.toLowerCase()}s`,
        make: () => ({ by: cap.by, mode: "explicit", ids: [] }),
      });
    }
  }

  const activeKey = series
    ? `${series.by}:${series.mode ?? "auto"}`
    : "none";
  const activeCap = series ? caps.find((c) => c.by === series.by) : undefined;
  const activeDim = activeCap ? seriesDimension(dataset, activeCap) : null;

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Series" className="flex flex-col gap-1">
        <SeriesRadio
          label="One line"
          checked={series === null}
          onSelect={() => onChange(null)}
        />
        {choices.map((c) => (
          <SeriesRadio
            key={c.key}
            label={c.label}
            checked={activeKey === c.key}
            onSelect={() => onChange(c.make())}
          />
        ))}
      </div>

      {series?.mode === "top" && activeCap && (
        <label className="flex items-center gap-2 pl-5 text-[12px] text-foreground/85">
          <span>How many lines?</span>
          <input
            type="number"
            min={1}
            max={activeCap.max}
            value={series.topN ?? Math.min(5, activeCap.max)}
            className="w-16 rounded-md border border-border bg-muted px-2 py-1 text-[12px] text-foreground outline-none"
            onChange={(e) => {
              const parsed = Number.parseInt(e.target.value, 10);
              const topN = Number.isNaN(parsed)
                ? Math.min(5, activeCap.max)
                : Math.min(activeCap.max, Math.max(1, parsed));
              onChange({ by: series.by, mode: "top", topN });
            }}
          />
          <span className="text-muted-foreground">(up to {activeCap.max})</span>
        </label>
      )}

      {series?.mode === "explicit" && activeCap && (
        <div className="pl-5">
          <InsightEntityPicker
            label={activeDim?.label ?? "items"}
            selected={series.ids ?? []}
            max={activeCap.max}
            onChange={(ids) => onChange({ by: series.by, mode: "explicit", ids })}
            {...(activeDim?.optionsSource
              ? { optionsSource: activeDim.optionsSource }
              : source.credentialMode === "internal"
                ? { options: internalEntityOptions }
                : { options: [] })}
          />
        </div>
      )}
    </div>
  );
}

function SeriesRadio({
  label,
  checked,
  onSelect,
}: {
  label: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[12px] text-foreground/85">
      <input
        type="radio"
        name="insight-series"
        className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
        checked={checked}
        onChange={onSelect}
      />
      <span>{label}</span>
    </label>
  );
}
