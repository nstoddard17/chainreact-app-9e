"use client";

import type { ConnectedValueMeta } from "@/contracts/connectedAnalytics";
import { formatInsightValue } from "./formatInsightValue";
import type { InsightChartBucket, InsightChartSeries } from "./InsightLineChart";

/**
 * The accessible data representation of an insight line chart (CD-3A):
 * exactly the same buckets and values, as a real table — so nothing about the
 * chart is available only visually or on hover. This is the a11y fallback,
 * not the user-selectable Table chart type (that's CD-3B).
 */
export function InsightDataTable({
  caption,
  buckets,
  series,
  compareValues = null,
  valueMeta,
}: {
  caption: string;
  buckets: readonly InsightChartBucket[];
  series: readonly InsightChartSeries[];
  compareValues?: readonly (number | null)[] | null;
  valueMeta: ConnectedValueMeta;
}) {
  return (
    <div className="max-h-[220px] overflow-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-[11px]">
        <caption className="sr-only">{caption}</caption>
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
            {compareValues != null && (
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
              {compareValues != null && (
                <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                  {formatInsightValue(compareValues[i] ?? null, valueMeta)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
