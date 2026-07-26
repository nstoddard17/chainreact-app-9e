"use client";

import { insightSeriesColor } from "./InsightLineChart";
import type { InsightBarSeries } from "./InsightBarChart";

/**
 * Legend for the Custom Insight bar chart (split from InsightBarChart for the
 * 400-line file cap — CD-5B). Legend buttons control VISIBILITY only; they
 * never initiate exploration.
 */
export function InsightBarLegend({
  series,
  hidden,
  onToggleSeries,
  compareLabel,
  compareFill,
  showCompareEntry,
  compareHidden,
  onToggleCompare,
}: {
  series: readonly InsightBarSeries[];
  hidden: ReadonlySet<string>;
  onToggleSeries: (id: string) => void;
  compareLabel: string;
  compareFill: string;
  showCompareEntry: boolean;
  compareHidden: boolean;
  onToggleCompare: () => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1"
      role="list"
      aria-label="Chart legend"
    >
      {series.map((s, i) => {
        const off = hidden.has(s.id);
        return (
          <button
            key={s.id}
            type="button"
            role="listitem"
            aria-pressed={!off}
            className={
              "inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] hover:bg-muted " +
              (off ? "text-muted-foreground/50 line-through" : "text-muted-foreground")
            }
            onClick={() => onToggleSeries(s.id)}
            title={off ? `Show ${s.label}` : `Hide ${s.label}`}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: insightSeriesColor(i), opacity: off ? 0.35 : 1 }}
              aria-hidden
            />
            <span className="max-w-[140px] truncate">{s.label}</span>
          </button>
        );
      })}
      {showCompareEntry && (
        <button
          type="button"
          role="listitem"
          aria-pressed={!compareHidden}
          className={
            "inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] hover:bg-muted " +
            (compareHidden ? "text-muted-foreground/50 line-through" : "text-muted-foreground")
          }
          onClick={onToggleCompare}
          title={compareHidden ? `Show ${compareLabel}` : `Hide ${compareLabel}`}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: compareFill, opacity: compareHidden ? 0.35 : 1 }}
            aria-hidden
          />
          <span className="max-w-[140px] truncate">{compareLabel}</span>
        </button>
      )}
    </div>
  );
}
