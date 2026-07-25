"use client";

import { useState } from "react";
import type { ConnectedAnalyticsResult } from "@/contracts/connectedAnalytics";
import { InsightKpi } from "./InsightKpi";
import { InsightLineChart } from "./InsightLineChart";
import { InsightDataTable } from "./InsightDataTable";
import { InsightCompletenessBadge, InsightFreshness, InsightMessage } from "./InsightStates";
import type { InsightFailure } from "./useInsightQuery";

/**
 * The one successful-result renderer for Custom Insights (CD-3A) — the
 * builder preview and the saved widget both render THROUGH this component,
 * so a saved widget always looks like its preview.
 *
 * KPI results → InsightKpi. Time-series results → InsightLineChart plus a
 * generated summary and a "View data" toggle exposing the accessible table
 * with exactly the chart's buckets/values.
 */
export function InsightResult({
  result,
  refreshError,
  onRefresh,
  refreshing,
}: {
  result: ConnectedAnalyticsResult;
  refreshError: InsightFailure | null;
  onRefresh?: (() => void) | undefined;
  refreshing?: boolean;
}) {
  const [showData, setShowData] = useState(false);
  const sourceLabel = result.source.sourceLabel;
  const attribution = result.source.attributionPrefix ?? sourceLabel;

  const buckets = result.buckets ?? [];
  const series = (result.series ?? []).map((s) => ({
    id: s.id,
    label: s.label,
    values: s.values,
  }));
  const isTimeSeries = result.kind === "time_series";
  const summary = isTimeSeries
    ? `${result.measure.label} by ${result.grain ?? "period"}${
        buckets.length > 0
          ? ` from ${buckets[0]!.label} to ${buckets[buckets.length - 1]!.label}`
          : ""
      }${series.length > 1 ? `, ${series.length} lines` : ""} — ${attribution}.`
    : `${result.measure.label} — ${attribution}.`;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <InsightCompletenessBadge result={result} />

      <div className="min-h-0 flex-1">
        {result.kind === "kpi" ? (
          <InsightKpi result={result} />
        ) : isTimeSeries ? (
          buckets.length === 0 || series.length === 0 ? (
            <InsightMessage icon="History" title="No data in this range yet." />
          ) : showData ? (
            <InsightDataTable
              caption={summary}
              buckets={buckets}
              series={series}
              compareValues={result.compareSeries?.values ?? null}
              valueMeta={result.valueMeta}
            />
          ) : (
            <InsightLineChart
              buckets={buckets}
              series={series}
              compareValues={result.compareSeries?.values ?? null}
              valueMeta={result.valueMeta}
              ariaLabel={summary}
            />
          )
        ) : (
          // categorical/table results need CD-3B's chart types.
          <InsightMessage
            icon="Layers"
            title="This layout isn't supported yet."
            body="Edit the widget and choose a number or line chart."
          />
        )}
      </div>

      {isTimeSeriesWithData(result) && (
        <button
          type="button"
          className="self-start rounded-md px-1 py-0.5 text-[10.5px] text-primary hover:underline"
          onClick={() => setShowData((v) => !v)}
          aria-expanded={showData}
        >
          {showData ? "View chart" : "View data"}
        </button>
      )}

      <InsightFreshness
        result={result}
        sourceLabel={sourceLabel}
        refreshError={refreshError}
        onRefresh={onRefresh}
        refreshing={refreshing ?? false}
      />
    </div>
  );
}

function isTimeSeriesWithData(result: ConnectedAnalyticsResult): boolean {
  return (
    result.kind === "time_series" &&
    (result.buckets?.length ?? 0) > 0 &&
    (result.series?.length ?? 0) > 0
  );
}
