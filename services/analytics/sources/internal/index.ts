import type {
  AnalyticsOverview,
  AnalyticsRange,
} from "@/contracts/analytics";
import { getAnalyticsOverview } from "@/services/analytics/analyticsOverview";
import {
  AnalyticsSourceError,
  type AnalyticsSourceAdapter,
  type AnalyticsSourceMetric,
  type AnalyticsSourceQuery,
  type AnalyticsSourceContext,
  type NormalizedAnalyticsResult,
} from "../types";

/**
 * Internal ("ChainReact") analytics source (Slice ANALYTICS-SOURCES-1).
 *
 * The reference adapter that proves the source contract end to end using REAL,
 * account-scoped ChainReact data (the existing `getAnalyticsOverview` aggregation)
 * — NOT a connected app, NOT fake data, and with NO workflow-node execution. It
 * exists so the registry + normalized result + query flow are real and testable
 * before any external provider adapter (which will land in its own
 * security-reviewed slice).
 *
 * `connectedApp: false` → it never resolves OAuth credentials; it only reads the
 * account's own run/workflow aggregates.
 */

const DAY_MS = 86_400_000;

const METRICS: readonly AnalyticsSourceMetric[] = [
  {
    key: "runs_over_time",
    label: "Runs over time",
    description: "Successful vs. failed runs per day.",
    visualizations: ["series"],
    supportedGroupBy: ["day"],
    supportedFilters: [],
  },
  {
    key: "success_rate",
    label: "Success rate",
    description: "Share of runs that succeeded in the range.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "top_workflows",
    label: "Top automations by runs",
    description: "Workflows ranked by run count.",
    visualizations: ["breakdown", "table"],
    supportedGroupBy: ["workflow"],
    supportedFilters: [],
  },
];

/** Map an arbitrary window to the nearest internal-overview preset. */
export function rangeToPreset(since: string, until: string): AnalyticsRange {
  const s = Date.parse(since);
  const u = Date.parse(until);
  if (Number.isNaN(s) || Number.isNaN(u) || u <= s) return "7d";
  const days = Math.ceil((u - s) / DAY_MS);
  if (days <= 1) return "today";
  if (days <= 7) return "7d";
  if (days <= 30) return "30d";
  if (days <= 90) return "90d";
  return "ytd";
}

function liveFreshness(): NormalizedAnalyticsResult["freshness"] {
  return { cached: false, ageSeconds: 0, ttlSeconds: null };
}

/**
 * PURE transform: a computed overview + metric key → normalized result. Separated
 * from the I/O so the normalization is unit-tested without a DB. `generatedAt` is
 * injected for deterministic tests.
 */
export function overviewToNormalized(
  overview: AnalyticsOverview,
  metricKey: string,
  generatedAt: string,
): NormalizedAnalyticsResult {
  const base = { generatedAt, freshness: liveFreshness(), warnings: [] as string[] };

  if (metricKey === "runs_over_time") {
    return {
      ...base,
      shape: "series",
      dimensions: ["date"],
      measures: ["succeeded", "failed"],
      rows: overview.runsOverTime.map((p) => ({
        date: p.date,
        succeeded: p.succeeded,
        failed: p.failed,
      })),
      totals: { succeeded: overview.totals.succeeded, failed: overview.totals.failed },
      truncated: overview.truncated,
    };
  }

  if (metricKey === "success_rate") {
    const pct = Math.round(overview.totals.successRate * 100);
    return {
      ...base,
      shape: "scalar",
      dimensions: [],
      measures: ["success_rate"],
      rows: [{ success_rate: pct }],
      totals: { success_rate: pct },
      truncated: overview.truncated,
    };
  }

  if (metricKey === "top_workflows") {
    return {
      ...base,
      shape: "breakdown",
      dimensions: ["workflow"],
      measures: ["runs", "success_rate"],
      rows: overview.workflows.slice(0, 10).map((w) => ({
        workflow: w.name,
        runs: w.runs,
        success_rate: Math.round(w.successRate * 100),
      })),
      totals: { runs: overview.totals.runs },
      truncated: overview.truncated || overview.workflows.length > 10,
    };
  }

  throw new AnalyticsSourceError(
    `Unknown internal metric: ${metricKey}`,
    "UNKNOWN_METRIC",
  );
}

export const internalAnalyticsSource: AnalyticsSourceAdapter = {
  providerKey: "internal",
  displayName: "ChainReact",
  connectedApp: false,
  metrics: METRICS,
  async query(
    query: AnalyticsSourceQuery,
    ctx: AnalyticsSourceContext,
  ): Promise<NormalizedAnalyticsResult> {
    if (!METRICS.some((m) => m.key === query.metricKey)) {
      throw new AnalyticsSourceError(
        `Unknown internal metric: ${query.metricKey}`,
        "UNKNOWN_METRIC",
      );
    }
    const preset = rangeToPreset(query.range.since, query.range.until);
    // Account-scoped: ctx.accountId MUST be the caller's own resolved account.
    const overview = await getAnalyticsOverview(ctx.accountId, preset);
    return overviewToNormalized(overview, query.metricKey, new Date().toISOString());
  },
};
