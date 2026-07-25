"use client";

import type { ReactNode } from "react";
import type { ConnectedAnalyticsResult } from "@/contracts/connectedAnalytics";
import { formatInsightValue } from "./formatInsightValue";

/**
 * The user-SELECTABLE table display (CD-3B).
 *
 * Distinct from `InsightDataTable`, which is the accessibility fallback bolted
 * onto a graphical chart: this one is a chart type in its own right, chosen in
 * the builder and persisted in the saved question. It renders every connected
 * result shape from the SAME query — there is no table-specific query:
 *   - kpi         → one labeled row.
 *   - time series → one row per bucket, one column per series.
 *   - categorical → one row per category (+ a record count when the server
 *                   supplies one), in the server's order (the saved `sort`).
 *
 * Only server-provided labels are shown — never a row id, a raw provider field
 * name, or payload data. Row counts are already bounded by the query's limit
 * and the dataset's `maxCategoryRows`; the table adds a local scroller rather
 * than client-side pagination.
 */
export function InsightTableChart({
  result,
  caption,
}: {
  result: ConnectedAnalyticsResult;
  caption: string;
}) {
  const { valueMeta } = result;
  const sortedBy = result.dimension !== null && result.dimension !== "time" ? result.dimension : null;
  const valueSort =
    sortedBy !== null ? ("descending" as const) : undefined;

  if (result.kind === "kpi") {
    return (
      <TableFrame caption={caption}>
        <thead className="sticky top-0 bg-muted">
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left font-medium text-muted-foreground">
              Measure
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium text-muted-foreground">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-border">
            <th scope="row" className="px-2 py-1 text-left font-normal text-foreground/80">
              {result.measure.label}
            </th>
            <td className="px-2 py-1 text-right font-mono text-foreground">
              {formatInsightValue(result.value ?? null, valueMeta)}
            </td>
          </tr>
          {result.compare && (
            <tr className="border-t border-border">
              <th scope="row" className="px-2 py-1 text-left font-normal text-muted-foreground">
                Previous period
              </th>
              <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                {formatInsightValue(result.compare.previousValue, valueMeta)}
              </td>
            </tr>
          )}
        </tbody>
      </TableFrame>
    );
  }

  if (result.kind === "time_series") {
    const buckets = result.buckets ?? [];
    const series = result.series ?? [];
    if (buckets.length === 0 || series.length === 0) return <TableEmpty />;
    return (
      <TableFrame caption={caption}>
        <thead className="sticky top-0 bg-muted">
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left font-medium text-muted-foreground">
              Period
            </th>
            {series.map((s) => (
              <th
                key={s.id}
                scope="col"
                className="px-2 py-1.5 text-right font-medium text-muted-foreground"
              >
                {s.label}
              </th>
            ))}
            {result.compareSeries && (
              <th scope="col" className="px-2 py-1.5 text-right font-medium text-muted-foreground">
                Previous period
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {buckets.map((b, i) => (
            <tr key={b.start} className="border-t border-border">
              <th scope="row" className="px-2 py-1 text-left font-normal text-foreground/80">
                {b.label}
              </th>
              {series.map((s) => (
                <td key={s.id} className="px-2 py-1 text-right font-mono text-foreground">
                  {formatInsightValue(s.values[i] ?? null, valueMeta)}
                </td>
              ))}
              {result.compareSeries && (
                <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                  {formatInsightValue(result.compareSeries.values[i] ?? null, valueMeta)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </TableFrame>
    );
  }

  // categorical (and the contract's "table" kind, which carries the same rows)
  const rows = result.rows ?? [];
  if (rows.length === 0) return <TableEmpty />;
  const showRecords = rows.some((r) => r.records !== undefined);
  return (
    <TableFrame caption={caption}>
      <thead className="sticky top-0 bg-muted">
        <tr>
          <th scope="col" className="px-2 py-1.5 text-left font-medium text-muted-foreground">
            Group
          </th>
          <th
            scope="col"
            className="px-2 py-1.5 text-right font-medium text-muted-foreground"
            {...(valueSort ? { "aria-sort": valueSort } : {})}
          >
            {result.measure.label}
          </th>
          {showRecords && (
            <th scope="col" className="px-2 py-1.5 text-right font-medium text-muted-foreground">
              Records
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-border">
            <th scope="row" className="px-2 py-1 text-left font-normal text-foreground/80">
              {r.label}
              {r.entityState === "deleted" && (
                <span className="ml-1 text-[10px] text-muted-foreground">(deleted)</span>
              )}
            </th>
            <td className="px-2 py-1 text-right font-mono text-foreground">
              {formatInsightValue(r.value, valueMeta)}
            </td>
            {showRecords && (
              <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                {r.records !== undefined ? r.records.toLocaleString("en-US") : "—"}
              </td>
            )}
          </tr>
        ))}
        {result.total != null && (
          <tr className="border-t-2 border-border">
            <th scope="row" className="px-2 py-1 text-left font-medium text-foreground">
              Total
            </th>
            <td className="px-2 py-1 text-right font-mono font-semibold text-foreground">
              {formatInsightValue(result.total, valueMeta)}
            </td>
            {showRecords && <td />}
          </tr>
        )}
      </tbody>
    </TableFrame>
  );
}

function TableFrame({
  caption,
  children,
}: {
  caption: string;
  children: ReactNode;
}) {
  return (
    // Local scroller: the table never widens the dashboard page at 320px.
    <div className="h-full max-h-full overflow-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-[11px]">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

function TableEmpty() {
  return (
    <div className="flex h-full min-h-[80px] items-center justify-center text-xs text-muted-foreground">
      No data in this range yet.
    </div>
  );
}
