"use client";

import { useState } from "react";
import type { ConnectedAnalyticsResult } from "@/contracts/connectedAnalytics";
import type { InsightChartType } from "@/contracts/analytics";
import { InsightKpi } from "./InsightKpi";
import { InsightLineChart } from "./InsightLineChart";
import { InsightBarChart, type InsightBarGroup } from "./InsightBarChart";
import { InsightTableChart } from "./InsightTableChart";
import { InsightDonutChart } from "./InsightDonutChart";
import { InsightDataTable } from "./InsightDataTable";
import { InsightCompletenessBadge, InsightFreshness, InsightMessage } from "./InsightStates";
import type { InsightFailure } from "./useInsightQuery";
import { describeWindow } from "@/core/analytics/insightRange";

/**
 * Read a resolved `[from, to)` ISO window back as inclusive calendar days.
 * Returns null when absent or unparseable — the UI simply omits the line
 * rather than printing a broken date.
 */
function describeIsoWindow(range: { from: string; to: string } | null): string | null {
  if (!range) return null;
  const fromMs = Date.parse(range.from);
  const toMs = Date.parse(range.to);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs) || toMs <= fromMs) return null;
  return describeWindow(fromMs, toMs);
}

/**
 * The one successful-result renderer for Custom Insights (CD-3A; CD-3B added
 * bar / selectable table / donut) — the builder preview and the saved widget
 * both render THROUGH this component, so a saved widget always looks like its
 * preview, and every chart type inherits the same freshness, completeness,
 * and error surfaces.
 *
 * The graphical types (line, bar, donut) each expose the SAME accessible data
 * view via "View data"; the selectable table is already a table, so it has no
 * toggle. Which type to draw comes from the persisted `chart` intent, falling
 * back to the result's own shape when a legacy config predates the field.
 */
export function InsightResult({
  result,
  chart,
  refreshError,
  onRefresh,
  refreshing,
}: {
  result: ConnectedAnalyticsResult;
  /** The saved display intent; omitted ⇒ inferred from the result shape. */
  chart?: InsightChartType | undefined;
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
  const rows = result.rows ?? [];
  const isTimeSeries = result.kind === "time_series";
  const isCategorical = result.kind === "categorical" || result.kind === "table";

  const effectiveChart: InsightChartType =
    chart ?? (isTimeSeries ? "line" : isCategorical ? "table" : "kpi");

  // The dates this result actually covers. The engine works in half-open UTC
  // windows; these read them back as inclusive calendar days (CD-5A), so the
  // chart states its own period instead of leaving the user to infer it.
  const rangeLabel = describeIsoWindow(result.range);
  const previousRangeLabel = describeIsoWindow(
    result.compare?.previousRange ?? result.compareSeries?.previousRange ?? null,
  );

  const periodSentence = rangeLabel
    ? ` Covering ${rangeLabel} UTC.${
        previousRangeLabel ? ` Compared with ${previousRangeLabel}.` : ""
      }`
    : "";

  const summary =
    (isTimeSeries
      ? `${result.measure.label} by ${result.grain ?? "period"}${
          buckets.length > 0
            ? ` from ${buckets[0]!.label} to ${buckets[buckets.length - 1]!.label}`
            : ""
        }${series.length > 1 ? `, ${series.length} lines` : ""} — ${attribution}.`
      : isCategorical
        ? `${result.measure.label} by ${result.dimension ?? "group"}, ${rows.length} group${
            rows.length === 1 ? "" : "s"
          } — ${attribution}.`
        : `${result.measure.label} — ${attribution}.`) + periodSentence;

  // Bar + accessible-table inputs, normalized from whichever shape came back.
  const barGroups: InsightBarGroup[] = isTimeSeries
    ? buckets.map((b, i) => ({
        id: b.start,
        label: b.label,
        values: series.map((s) => s.values[i] ?? null),
      }))
    : rows.map((r) => ({ id: r.id, label: r.label, values: [r.value] }));
  const barSeries = isTimeSeries
    ? series.map((s) => ({ id: s.id, label: s.label }))
    : [{ id: "value", label: result.measure.label }];
  // The a11y table takes chart-shaped columns; a categorical result becomes
  // one "bucket" per row with a single measure column.
  const tableBuckets = isTimeSeries
    ? buckets
    : rows.map((r) => ({ start: r.id, end: r.id, label: r.label }));
  const tableSeries = isTimeSeries
    ? series
    : [{ id: "value", label: result.measure.label, values: rows.map((r) => r.value) }];

  const hasGraphicalData = isTimeSeries
    ? buckets.length > 0 && series.length > 0
    : isCategorical
      ? rows.length > 0
      : false;
  const isGraphical =
    effectiveChart === "line" || effectiveChart === "bar" || effectiveChart === "donut";

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <InsightCompletenessBadge result={result} />

      <div className="min-h-0 flex-1">
        {effectiveChart === "kpi" ? (
          <InsightKpi result={result} />
        ) : effectiveChart === "table" ? (
          <InsightTableChart result={result} caption={summary} />
        ) : !hasGraphicalData ? (
          <InsightMessage icon="History" title="No data in this range yet." />
        ) : showData ? (
          <InsightDataTable
            caption={summary}
            buckets={tableBuckets}
            series={tableSeries}
            compareValues={isTimeSeries ? (result.compareSeries?.values ?? null) : null}
            valueMeta={result.valueMeta}
          />
        ) : effectiveChart === "line" ? (
          <InsightLineChart
            buckets={buckets}
            series={series}
            compareValues={result.compareSeries?.values ?? null}
            valueMeta={result.valueMeta}
            ariaLabel={summary}
          />
        ) : effectiveChart === "bar" ? (
          <InsightBarChart
            groups={barGroups}
            series={barSeries}
            valueMeta={result.valueMeta}
            ariaLabel={summary}
            isTime={isTimeSeries}
            compareValues={isTimeSeries ? (result.compareSeries?.values ?? null) : null}
          />
        ) : (
          <InsightDonutChart result={result} ariaLabel={summary} />
        )}
      </div>

      {rangeLabel && (
        <p className="text-[10.5px] text-muted-foreground" role="note">
          {rangeLabel} (UTC)
          {previousRangeLabel ? ` · vs ${previousRangeLabel}` : ""}
        </p>
      )}

      {isGraphical && hasGraphicalData && (
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
