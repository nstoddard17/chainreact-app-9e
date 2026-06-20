import { getActiveForExecution } from "@/repositories/integrations";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import {
  AnalyticsApiError,
  AnalyticsNotFoundError,
  AnalyticsQuotaError,
} from "@/integrations/_shared/google/api/analytics/errors";
import {
  AnalyticsSourceError,
  type AnalyticsSourceAdapter,
  type AnalyticsSourceContext,
  type AnalyticsSourceMetric,
  type AnalyticsSourceQuery,
  type NormalizedAnalyticsResult,
} from "../types";
import { gaScalar, gaSeries } from "./api";
import { bucketIndexForMs, parsePropertyId, planBuckets, toGaDate } from "./buckets";

/**
 * Google Analytics (GA4) connected-app analytics source — v1
 * (Slice ANALYTICS-SOURCES-GA-1). The 25th and final connected-app provider,
 * closing the coverage arc at 25/25.
 *
 * READ-ONLY + AGGREGATE-ONLY. Reduces bounded GA4 Data API `runReport` calls
 * (scoped to ONE validated property) to numeric aggregates:
 *   - Scalars over the dashboard range: active users, total users, sessions,
 *     screen page views, event count (no dimension → GA's range total).
 *   - Over-time series: the same metrics with the GA4 `date` dimension, summed
 *     into the dashboard bucket plan (≤ MAX_BUCKETS), matching the other
 *     connected-app providers' bounded shape.
 *
 * Never executes a workflow node, never takes a GA metric/dimension string from
 * widget config (the metric is resolved from a SERVER-SIDE allow-list and the only
 * dimension ever requested is `date`), and never reads a user id, client id, page
 * path, URL, search term, source/medium, or geo/device dimension. Approved metrics
 * only.
 *
 * CREDENTIAL MODEL (personal provider, per core/integrations/credentialSharing.ts):
 * Google Analytics is PERSONAL + REFRESHABLE (delegated-user Google OAuth, the
 * already-granted `analytics.readonly` scope — no new scope). This resolves the
 * REQUESTING USER'S OWN connection (`connected_by_user_id = ctx.userId`) and pins
 * refresh/retry to that row — never a co-member's. The cache layer keys personal
 * providers with `source_user_id = ctx.userId`, so a co-member viewing a shared
 * dashboard sees their OWN GA result or a Connect state, never the creator's GA
 * data. No connection → MISSING_CREDENTIAL.
 *
 * PRIVACY: only the approved aggregate metric values + date buckets are computed
 * and cached. No GA report rows beyond the scalar/series numbers, no property
 * display name, no raw GA payload, no token, and no Measurement Protocol url
 * (which embeds the api_secret) are ever returned or stored. Property display
 * labels live in widget config, not chart data.
 */

const PROVIDER_KEY = "google-analytics";
const PROPERTY_FILTER = ["ga_property"] as const;

/** Approved scalar metric key → GA4 Data API metric name. */
const SCALAR_GA_METRIC: Readonly<Record<string, string>> = {
  active_users: "activeUsers",
  total_users: "totalUsers",
  sessions: "sessions",
  screen_page_views: "screenPageViews",
  event_count: "eventCount",
};

/** Approved over-time series metric key → GA4 Data API metric name (dim = date). */
const SERIES_GA_METRIC: Readonly<Record<string, string>> = {
  active_users_over_time: "activeUsers",
  sessions_over_time: "sessions",
  screen_page_views_over_time: "screenPageViews",
  event_count_over_time: "eventCount",
};

const METRICS: readonly AnalyticsSourceMetric[] = [
  {
    key: "active_users",
    label: "Active users",
    description: "Active users in the selected property over the date range.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: PROPERTY_FILTER,
  },
  {
    key: "total_users",
    label: "Total users",
    description: "Total users in the selected property over the date range.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: PROPERTY_FILTER,
  },
  {
    key: "sessions",
    label: "Sessions",
    description: "Sessions in the selected property over the date range.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: PROPERTY_FILTER,
  },
  {
    key: "screen_page_views",
    label: "Page views",
    description: "Screen / page views over the date range.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: PROPERTY_FILTER,
  },
  {
    key: "event_count",
    label: "Events",
    description: "Event count over the date range.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: PROPERTY_FILTER,
  },
  {
    key: "active_users_over_time",
    label: "Active users over time",
    description: "Active users per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: PROPERTY_FILTER,
  },
  {
    key: "sessions_over_time",
    label: "Sessions over time",
    description: "Sessions per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: PROPERTY_FILTER,
  },
  {
    key: "screen_page_views_over_time",
    label: "Page views over time",
    description: "Screen / page views per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: PROPERTY_FILTER,
  },
  {
    key: "event_count_over_time",
    label: "Events over time",
    description: "Event count per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: PROPERTY_FILTER,
  },
];

function liveFreshness(): NormalizedAnalyticsResult["freshness"] {
  return { cached: false, ageSeconds: 0, ttlSeconds: null };
}

/** Map any error from a GA read into a typed, leak-free AnalyticsSourceError. */
function classifyGoogleAnalyticsError(err: unknown): AnalyticsSourceError {
  if (err instanceof AnalyticsSourceError) return err;
  if (err instanceof IntegrationActionRequiredError || err instanceof Unauthorized401Error) {
    return new AnalyticsSourceError(
      "Reconnect Google Analytics before this widget can load.",
      "MISSING_CREDENTIAL",
    );
  }
  if (err instanceof AnalyticsQuotaError) {
    return new AnalyticsSourceError(
      "Google Analytics' rate limit was reached. Try again shortly.",
      "RATE_LIMITED",
    );
  }
  if (err instanceof AnalyticsNotFoundError) {
    return new AnalyticsSourceError(
      "ChainReact can't read that Google Analytics property. Re-pick a property.",
      "INVALID_QUERY",
    );
  }
  // AnalyticsApiError + anything else: no raw GA body / token / payload leak — a
  // generic, safe message (the wrapper already reduced GA errors to a tag, and we
  // drop even that from user-facing copy).
  void (err instanceof AnalyticsApiError);
  return new AnalyticsSourceError("Couldn't load Google Analytics data.", "PROVIDER_ERROR");
}

/** Resolve the requesting user's OWN Google Analytics connection (or MISSING_CREDENTIAL). */
async function resolveOwnGa(ctx: AnalyticsSourceContext): Promise<{ providerAccountId: string | null }> {
  const integration = await getActiveForExecution(ctx.accountId, PROVIDER_KEY, null, {
    connectedByUserId: ctx.userId,
  });
  if (!integration) {
    throw new AnalyticsSourceError("Connect Google Analytics to use this widget.", "MISSING_CREDENTIAL");
  }
  return { providerAccountId: integration.providerAccountId };
}

function scalarResult(
  metricKey: string,
  value: number,
  generatedAt: string,
): NormalizedAnalyticsResult {
  return {
    shape: "scalar",
    dimensions: [],
    measures: [metricKey],
    rows: [{ [metricKey]: value }],
    totals: { [metricKey]: value },
    generatedAt,
    freshness: liveFreshness(),
    warnings: [],
    truncated: false,
  };
}

function seriesResult(
  rows: ReadonlyArray<{ date: string; count: number }>,
  generatedAt: string,
  warnings: string[],
  truncated: boolean,
): NormalizedAnalyticsResult {
  return {
    shape: "series",
    dimensions: ["date"],
    measures: ["count"],
    rows: rows.map((r) => ({ date: r.date, count: r.count })),
    totals: { count: rows.reduce((a, r) => a + r.count, 0) },
    generatedAt,
    freshness: liveFreshness(),
    warnings,
    truncated,
  };
}

export const googleAnalyticsAnalyticsSource: AnalyticsSourceAdapter = {
  providerKey: PROVIDER_KEY,
  displayName: "Google Analytics",
  connectedApp: true,
  // GA4 Data API has tighter per-property token quotas than file/message providers,
  // so cache a touch longer (15 min) to stay well under the daily budget.
  cacheTtlSeconds: 900,
  metrics: METRICS,

  async query(
    query: AnalyticsSourceQuery,
    ctx: AnalyticsSourceContext,
  ): Promise<NormalizedAnalyticsResult> {
    const metric = METRICS.find((m) => m.key === query.metricKey);
    if (!metric) {
      throw new AnalyticsSourceError(
        `Unknown Google Analytics metric: ${query.metricKey}`,
        "UNKNOWN_METRIC",
      );
    }

    // Validate the REQUIRED property id server-side BEFORE any I/O.
    let propertyId: string;
    try {
      propertyId = parsePropertyId(query.filters?.ga_property);
    } catch (err) {
      throw new AnalyticsSourceError(
        err instanceof Error ? err.message : "Pick a Google Analytics property.",
        "INVALID_QUERY",
      );
    }

    // Validate the date range → GA `YYYY-MM-DD` before any I/O.
    const startDate = toGaDate(query.range.since);
    const endDate = toGaDate(query.range.until);
    if (startDate === null || endDate === null) {
      throw new AnalyticsSourceError("The selected date range is invalid.", "INVALID_QUERY");
    }

    const generatedAt = new Date().toISOString();
    const { providerAccountId } = await resolveOwnGa(ctx);

    const run = <T>(apiCall: (accessToken: string) => Promise<T>): Promise<T> =>
      refreshAndRetry({ accountId: ctx.accountId, provider: PROVIDER_KEY, providerAccountId, apiCall });

    try {
      // ── Scalars ───────────────────────────────────────────────────────────
      const scalarMetric = SCALAR_GA_METRIC[query.metricKey];
      if (scalarMetric) {
        const value = await run((t) =>
          gaScalar({ accessToken: t, propertyId, metric: scalarMetric, startDate, endDate }),
        );
        return scalarResult(query.metricKey, value, generatedAt);
      }

      // ── Over-time series (GA `date` dimension → bucket plan) ───────────────
      const seriesMetric = SERIES_GA_METRIC[query.metricKey]!; // guaranteed by METRICS membership
      const buckets = planBuckets(query.range.since, query.range.until);
      if (buckets.length === 0) {
        return seriesResult([], generatedAt, ["The selected date range is empty or invalid."], false);
      }

      const series = await run((t) =>
        gaSeries({ accessToken: t, propertyId, metric: seriesMetric, startDate, endDate }),
      );

      const counts = new Array<number>(buckets.length).fill(0);
      for (const point of series.points) {
        const idx = bucketIndexForMs(buckets, point.dateMs);
        if (idx >= 0) counts[idx]! += point.value;
      }
      const rows = buckets.map((b, i) => ({ date: b.key, count: counts[i] ?? 0 }));
      const warnings = series.truncated
        ? ["Based on part of this range — it spans more days than a single widget reads."]
        : [];
      return seriesResult(rows, generatedAt, warnings, series.truncated);
    } catch (err) {
      throw classifyGoogleAnalyticsError(err);
    }
  },
};
