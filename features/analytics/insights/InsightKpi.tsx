"use client";

import type { ConnectedAnalyticsResult } from "@/contracts/connectedAnalytics";
import { formatInsightValue } from "./formatInsightValue";
import { describeInsightChange } from "./insightCompare";
import type { InsightDrill } from "./insightRefine";

/**
 * KPI (single number) rendering for Custom Insights (CD-3A).
 *
 * Value formatting is unit/currency-aware from the result's `valueMeta`
 * (formatInsightValue.ts). Null renders as an em dash with an explanation —
 * null means "no denominator / unavailable", never zero.
 *
 * Period comparison uses NEUTRAL language and color: the product has not
 * declared per-measure good/bad directionality (more failed runs is not
 * good; less revenue is not good), so an increase is just an increase.
 */
export function InsightKpi({
  result,
  onExplore,
}: {
  result: ConnectedAnalyticsResult;
  /**
   * CD-5B: an ungrouped number has nothing to drill into, so a plain KPI gets
   * NO click target — a meaningless one would train users that clicking does
   * nothing. The one specific refinement a KPI result can carry is its
   * comparison period; when present, an explicit "Explore previous period"
   * action drills into the server-supplied previous window.
   */
  onExplore?: (drill: InsightDrill) => void;
}) {
  const value = result.value ?? null;
  const display = formatInsightValue(value, result.valueMeta);
  const compare = result.compare ?? null;

  // Shared with the table's Change columns (insightCompare.ts) so a zero or
  // missing previous value is described identically wherever it appears.
  const compareLine = compare
    ? describeInsightChange(value, compare.previousValue, result.valueMeta)
    : null;

  return (
    <div className="flex h-full flex-col justify-center gap-1">
      <div
        className="text-3xl font-bold leading-none tracking-tight text-foreground"
        aria-label={`${result.measure.label}: ${value === null ? "not available" : display}`}
      >
        {display}
      </div>
      {value === null && (
        <div className="text-[11px] text-muted-foreground">No data to measure in this range.</div>
      )}
      {compareLine && (
        <div className="text-xs text-muted-foreground" role="note">
          {compareLine}
        </div>
      )}
      {onExplore && compare && (
        <button
          type="button"
          className="self-start rounded-md px-1 py-0.5 text-[10.5px] text-primary hover:underline"
          onClick={() =>
            onExplore({
              kind: "previous_window",
              from: compare.previousRange.from,
              to: compare.previousRange.to,
            })
          }
        >
          Explore previous period
        </button>
      )}
    </div>
  );
}
