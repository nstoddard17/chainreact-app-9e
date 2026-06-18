import { z } from "zod";

/**
 * Connected-app analytics SOURCE contract (Slice ANALYTICS-SOURCES-1).
 *
 * The read-only data-source layer that lets Analytics widgets pull normalized
 * metrics from a provider (or from ChainReact's own internal data) WITHOUT
 * touching the workflow engine. A source adapter exposes a fixed, approved set of
 * metrics and a single `query()` that returns a provider-NEUTRAL result.
 *
 * HARD BOUNDARY (enforced by design + tests):
 *   - Adapters NEVER execute trigger/action nodes or the workflow engine. They do
 *     read-only aggregation through the provider's own read APIs / internal data.
 *   - Widget config selects `(provider, metricKey, groupBy, filters)` from the
 *     APPROVED registry — never an arbitrary method name, URL, or node.
 *   - Account scope + credential authorization are the caller's responsibility
 *     (the future query route); the context carries the resolved account + user.
 *
 * Adapter contract + auth/caching design: docs/slices/phase-4/analytics/analytics-closeout.md.
 */

/** Provider-neutral visualization shapes a metric can populate. */
export const AnalyticsVisualizationShapeSchema = z.enum([
  "scalar", // single number (+ optional comparison)
  "series", // time series (dimension = time bucket)
  "breakdown", // categorical split (dimension = category)
  "table", // arbitrary rows
]);
export type AnalyticsVisualizationShape = z.infer<typeof AnalyticsVisualizationShapeSchema>;

/** A resolved, validated date window (ISO-8601, inclusive `since`). */
export interface AnalyticsDateRange {
  since: string;
  until: string;
}

/**
 * Execution context for a source query. The account is the authorization anchor
 * (resolved by the caller from its own session) and the credential-scoping anchor
 * for connected-app adapters; `userId` is the acting member (for per-user
 * personal-credential resolution + audit). NEVER a raw token — the adapter
 * resolves credentials through the existing OAuth seam keyed off this context.
 */
export interface AnalyticsSourceContext {
  accountId: string;
  userId: string;
}

/** A widget's request to a source: which metric, over what window, sliced how. */
export interface AnalyticsSourceQuery {
  metricKey: string;
  range: AnalyticsDateRange;
  /** Must be one of the metric's `supportedGroupBy`. */
  groupBy?: string;
  /** Keys must be within the metric's `supportedFilters`; adapter validates values. */
  filters?: Readonly<Record<string, string | number | boolean>>;
}

/** Static, declarative descriptor of one approved metric a source exposes. */
export interface AnalyticsSourceMetric {
  key: string;
  label: string;
  description?: string;
  /** Visualization shapes this metric can drive (the widget picks a compatible type). */
  visualizations: readonly AnalyticsVisualizationShape[];
  /** Allow-listed group-by dimensions ([] = none). */
  supportedGroupBy: readonly string[];
  /** Allow-listed filter keys ([] = none). */
  supportedFilters: readonly string[];
}

/** Cache/freshness metadata travelling with every result (drives "as of" UI). */
export const AnalyticsResultFreshnessSchema = z.object({
  /** True when served from a snapshot rather than computed live. */
  cached: z.boolean(),
  /** Age of the data in seconds (null when freshly computed / unknown). */
  ageSeconds: z.number().nonnegative().nullable(),
  /** TTL the snapshot was/will be stored under (null when not cached). */
  ttlSeconds: z.number().nonnegative().nullable(),
});
export type AnalyticsResultFreshness = z.infer<typeof AnalyticsResultFreshnessSchema>;

/**
 * The provider-NEUTRAL result every adapter returns. Widgets render from this
 * common shape, so the visualization layer is decoupled from any provider.
 *
 * `rows` are tabular records keyed by the declared `dimensions` + `measures`.
 * `totals` are aggregate measures across all rows. `warnings` surface partial/
 * degraded results (rate-limit, scope gap) WITHOUT failing the widget; `truncated`
 * flags a capped result set.
 */
export const NormalizedAnalyticsResultSchema = z.object({
  shape: AnalyticsVisualizationShapeSchema,
  dimensions: z.array(z.string()),
  measures: z.array(z.string()),
  rows: z.array(z.record(z.union([z.string(), z.number(), z.null()]))),
  totals: z.record(z.number()).optional(),
  generatedAt: z.string(),
  freshness: AnalyticsResultFreshnessSchema,
  warnings: z.array(z.string()),
  truncated: z.boolean(),
});
export type NormalizedAnalyticsResult = z.infer<typeof NormalizedAnalyticsResultSchema>;

/**
 * A registered analytics source adapter. Adapters are CODE, registered explicitly
 * in the registry — there is no dynamic/method-name dispatch from widget JSON.
 */
export interface AnalyticsSourceAdapter {
  /** Stable key referenced by widget config `dataSource.provider`. */
  providerKey: string;
  displayName: string;
  /**
   * false = ChainReact-internal source (no OAuth). true = external connected app
   * (resolves provider credentials through the existing OAuth seam, read-only).
   */
  connectedApp: boolean;
  /** The fixed, approved metric set. Anything not listed is rejected. */
  metrics: readonly AnalyticsSourceMetric[];
  /** Read-only query. MUST NOT execute workflow nodes or mutate anything. */
  query(
    query: AnalyticsSourceQuery,
    ctx: AnalyticsSourceContext,
  ): Promise<NormalizedAnalyticsResult>;
}

/** Typed error a source query can surface; the caller maps it to a widget warning/error. */
export class AnalyticsSourceError extends Error {
  readonly code:
    | "UNKNOWN_SOURCE"
    | "UNKNOWN_METRIC"
    | "INVALID_QUERY"
    | "MISSING_CREDENTIAL"
    | "PROVIDER_ERROR"
    | "RATE_LIMITED";
  constructor(message: string, code: AnalyticsSourceError["code"]) {
    super(message);
    this.name = "AnalyticsSourceError";
    this.code = code;
  }
}
