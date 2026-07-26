import type { ConnectedValueMeta } from "@/contracts/connectedAnalytics";
import { formatInsightValue } from "./formatInsightValue";

/**
 * ONE definition of previous-period change for Custom Insights (CD-5A).
 *
 * The KPI copy and the table's Change / Change % columns both come from here,
 * so "previous was zero" or "previous was missing" can never be described one
 * way in a number and a different way in a table of the same query.
 *
 * NEUTRALITY IS DELIBERATE: the product has not declared per-measure good/bad
 * directionality (more failed runs is not good; less spend is not bad), so a
 * rise is only ever described as a rise — never colored or worded as success.
 */

export interface InsightChange {
  /** current − previous; null when either side is missing. */
  absolute: number | null;
  /**
   * Fractional change (0.12 = +12%); null when it would not be meaningful —
   * a missing side, or a zero previous value (division by zero is not "∞%").
   */
  percent: number | null;
}

export function computeInsightChange(
  current: number | null,
  previous: number | null,
): InsightChange {
  if (current === null || previous === null) return { absolute: null, percent: null };
  const absolute = current - previous;
  if (previous === 0) return { absolute, percent: null };
  return { absolute, percent: absolute / Math.abs(previous) };
}

/** "+12.5%" / "−4%" / "" when a percentage isn't meaningful. */
export function formatChangePercent(percent: number | null): string {
  if (percent === null) return "";
  const pct = percent * 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

/** "+3" / "−1.2" / "" when either side is missing. Unit-aware. */
export function formatChangeAbsolute(
  absolute: number | null,
  meta: ConnectedValueMeta,
): string {
  if (absolute === null) return "";
  const sign = absolute > 0 ? "+" : absolute < 0 ? "−" : "";
  return `${sign}${formatInsightValue(Math.abs(absolute), meta)}`;
}

/**
 * The single sentence a KPI shows under its number. Returns null when the query
 * carried no comparison at all.
 */
export function describeInsightChange(
  current: number | null,
  previous: number | null,
  meta: ConnectedValueMeta,
): string {
  if (previous === null) return "No data in the previous period";
  if (current === null) return `Previous period: ${formatInsightValue(previous, meta)}`;
  if (previous === 0) {
    return current === 0
      ? "Unchanged from the previous period"
      : "Up from zero in the previous period";
  }
  const { percent } = computeInsightChange(current, previous);
  if (percent === null || percent === 0) return "→ Unchanged vs previous period";
  const word = percent > 0 ? "Up" : "Down";
  const arrow = percent > 0 ? "↑" : "↓";
  const magnitude = (Math.abs(percent) * 100).toLocaleString("en-US", {
    maximumFractionDigits: 1,
  });
  return `${arrow} ${word} ${magnitude}% vs previous period`;
}
