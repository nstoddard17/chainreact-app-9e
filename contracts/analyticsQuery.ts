import { z } from "zod";
import { AnalyticsRangeSchema } from "./analytics";
import { WorkflowRunTriggeredBySchema } from "./workflow";

/**
 * Typed analytics QUERY contract (Slice ANALYTICS-FLEXIBILITY-CS-1).
 *
 * The server-owned request/result shapes for `POST /api/analytics/query` — the
 * flexible workflow-run analytics foundation designed in
 * docs/slices/phase-5/analytics-flexibility-audit-1.md (§15).
 *
 * Design rules (enforced here + in the capability matrix + the service):
 *   - The client NEVER supplies an account id — scope is the caller's resolved
 *     active account (same gate as every other /api/analytics route).
 *   - Every measure/dimension/filter is a closed enum. No column names, no SQL,
 *     no JSON escape hatches. Unknown keys fail (`.strict()` everywhere).
 *   - Results are BOUNDED by contract (max series/buckets/rows), independent of
 *     how many run rows exist.
 *   - Deferred by product decision (do NOT add here without its own slice):
 *     `tasks_used` (D10 — reserve/reconcile billing not authoritative yet),
 *     error-category dimension (D9 follow-up — needs the `failure_code`
 *     normalization migration), provider attribution, node-level durations,
 *     `time_saved` / monetary cost (rejected as fake analytics).
 *
 * Cross-field validity (which dimension a measure supports, when series/compare
 * are allowed, …) lives in `contracts/analyticsQueryCapabilities.ts` so client
 * and server consume ONE canonical matrix.
 */

// ── Bounds (single source; also enforced server-side) ────────────────────────

/** Max simultaneous series on a time chart (product decision D5). */
export const ANALYTICS_QUERY_MAX_SERIES = 8;
/** Max workflow ids in a filter. */
export const ANALYTICS_QUERY_MAX_WORKFLOW_FILTERS = 20;
/** Max custom-range span, in days. */
export const ANALYTICS_QUERY_MAX_RANGE_DAYS = 366;
/** Max rows returned for a categorical dimension. */
export const ANALYTICS_QUERY_MAX_CATEGORY_ROWS = 50;
/** Default categorical row cap when the query names none. */
export const ANALYTICS_QUERY_DEFAULT_CATEGORY_ROWS = 25;
/** Hard ceiling on time buckets in one response (day grain × 366d = 366). */
export const ANALYTICS_QUERY_MAX_BUCKETS = 400;
/** Default Top-N when a workflow series names no explicit list. */
export const ANALYTICS_QUERY_DEFAULT_TOP_N = 5;

// ── Request ──────────────────────────────────────────────────────────────────

export const AnalyticsQueryMeasureSchema = z.enum([
  "runs",
  "succeeded_runs",
  "failed_runs",
  "success_rate",
  "avg_duration_ms",
]);
export type AnalyticsQueryMeasure = z.infer<typeof AnalyticsQueryMeasureSchema>;

/** Non-KPI dimensions. A KPI query sends `dimension: null`. */
export const AnalyticsQueryDimensionSchema = z.enum([
  "time",
  "workflow",
  "status",
  "trigger_source",
]);
export type AnalyticsQueryDimension = z.infer<typeof AnalyticsQueryDimensionSchema>;

export const AnalyticsTimeGrainSchema = z.enum(["auto", "day", "week", "month"]);
export type AnalyticsTimeGrain = z.infer<typeof AnalyticsTimeGrainSchema>;

/** Terminal run statuses — the only two the run domain has (no canceled state). */
export const AnalyticsRunStatusSchema = z.enum(["succeeded", "failed"]);
export type AnalyticsRunStatus = z.infer<typeof AnalyticsRunStatusSchema>;

const IsoDateTimeSchema = z
  .string()
  .min(1)
  .max(40)
  .refine((v) => !Number.isNaN(Date.parse(v)), {
    message: "Must be an ISO-8601 date-time.",
  });

/**
 * Date range: an existing preset (same semantics as the overview's selector) or
 * a bounded custom [from, to) window. Span validation (from < to, ≤ 366 days)
 * is cross-field and lives in `validateAnalyticsQuery`.
 */
export const AnalyticsQueryRangeSchema = z.union([
  z.object({ preset: AnalyticsRangeSchema }).strict(),
  z.object({ from: IsoDateTimeSchema, to: IsoDateTimeSchema }).strict(),
]);
export type AnalyticsQueryRange = z.infer<typeof AnalyticsQueryRangeSchema>;

/**
 * Series selection for time charts: each selected item becomes its own line.
 *   - `by: "workflow"` requires `mode`: `"explicit"` (exact ids, ≤ 8) or
 *     `"top"` (server-resolved Top-N by run count, default 5).
 *   - `by: "status"` needs no ids — the (≤ 2) terminal statuses are the series.
 * Cross-field rules (mode/ids/topN pairing, when series are allowed at all)
 * are enforced by `validateAnalyticsQuery`.
 */
export const AnalyticsQuerySeriesSchema = z
  .object({
    by: z.enum(["workflow", "status"]),
    mode: z.enum(["top", "explicit"]).optional(),
    topN: z.number().int().min(1).max(ANALYTICS_QUERY_MAX_SERIES).optional(),
    ids: z
      .array(z.string().uuid())
      .min(1)
      .max(ANALYTICS_QUERY_MAX_SERIES)
      .optional(),
  })
  .strict();
export type AnalyticsQuerySeries = z.infer<typeof AnalyticsQuerySeriesSchema>;

export const AnalyticsQueryFiltersSchema = z
  .object({
    workflowIds: z
      .array(z.string().uuid())
      .min(1)
      .max(ANALYTICS_QUERY_MAX_WORKFLOW_FILTERS)
      .optional(),
    statuses: z.array(AnalyticsRunStatusSchema).min(1).max(2).optional(),
    triggerSources: z.array(WorkflowRunTriggeredBySchema).min(1).max(7).optional(),
    /** Test runs are EXCLUDED unless explicitly included (production view). */
    includeTests: z.boolean().default(false),
  })
  .strict();
export type AnalyticsQueryFilters = z.infer<typeof AnalyticsQueryFiltersSchema>;

export const AnalyticsQuerySortSchema = z
  .object({
    by: z.enum(["value", "label"]),
    dir: z.enum(["asc", "desc"]),
  })
  .strict();
export type AnalyticsQuerySort = z.infer<typeof AnalyticsQuerySortSchema>;

export const AnalyticsQuerySchema = z
  .object({
    measure: AnalyticsQueryMeasureSchema,
    /** null = KPI (one aggregate number). */
    dimension: AnalyticsQueryDimensionSchema.nullable(),
    /** Only with `dimension: "time"`. Defaults to "auto" there. */
    timeGrain: AnalyticsTimeGrainSchema.optional(),
    /** Only with `dimension: "time"`. */
    series: AnalyticsQuerySeriesSchema.optional(),
    filters: AnalyticsQueryFiltersSchema.default({ includeTests: false }),
    range: AnalyticsQueryRangeSchema,
    /** Previous equal-length window. KPI + single-series time only (D6). */
    compare: z.literal("previous_period").nullable().optional(),
    /** Categorical dimensions only. Default: value desc. */
    sort: AnalyticsQuerySortSchema.optional(),
    /** Categorical row cap (≤ 50). Default 25. */
    limit: z
      .number()
      .int()
      .min(1)
      .max(ANALYTICS_QUERY_MAX_CATEGORY_ROWS)
      .optional(),
  })
  .strict();
export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>;

// ── Result ───────────────────────────────────────────────────────────────────

export const AnalyticsResolvedGrainSchema = z.enum(["day", "week", "month"]);
export type AnalyticsResolvedGrain = z.infer<typeof AnalyticsResolvedGrainSchema>;

/** Stable identity + current display label for a series or categorical row. */
export const AnalyticsSeriesMetaSchema = z.object({
  /** Stable id: workflow uuid, status value, trigger source, or "total". */
  id: z.string(),
  /** Current display label (current-name semantics; deleted → "… (deleted)"). */
  label: z.string(),
  /** Workflow lifecycle state when the series/row is a workflow; else null. */
  workflowState: z.string().nullable(),
});
export type AnalyticsSeriesMeta = z.infer<typeof AnalyticsSeriesMetaSchema>;

/** One calendar time bucket, [start, end) UTC. */
export const AnalyticsBucketSchema = z.object({
  start: z.string(),
  end: z.string(),
  /** Machine-stable label (bucket start, YYYY-MM-DD). */
  label: z.string(),
});
export type AnalyticsBucket = z.infer<typeof AnalyticsBucketSchema>;

const MeasureValueSchema = z.number().nullable();

export const AnalyticsQueryResultSchema = z
  .object({
    kind: z.enum(["kpi", "time_series", "categorical"]),
    measure: AnalyticsQueryMeasureSchema,
    dimension: AnalyticsQueryDimensionSchema.nullable(),
    /** Resolved grain for time series ("auto" resolved server-side); else null. */
    grain: AnalyticsResolvedGrainSchema.nullable(),
    /** The normalized [from, to) window actually queried (ISO, UTC). */
    range: z.object({ from: z.string(), to: z.string() }),
    includeTests: z.boolean(),
    /** KPI value. Count measures: number. rate/duration with no runs: null. */
    value: MeasureValueSchema.optional(),
    /** KPI previous-period comparison. */
    compare: z
      .object({
        previousValue: MeasureValueSchema,
        previousRange: z.object({ from: z.string(), to: z.string() }),
      })
      .nullable()
      .optional(),
    /** Time-series buckets (contiguous, calendar-aligned, ≤ MAX_BUCKETS). */
    buckets: z.array(AnalyticsBucketSchema).optional(),
    /** Time-series data: one entry per series, values index-aligned to buckets. */
    series: z
      .array(
        z.object({
          meta: AnalyticsSeriesMetaSchema,
          values: z.array(MeasureValueSchema),
        }),
      )
      .optional(),
    /** Single-series previous-period values, index-aligned to `buckets`. */
    compareSeries: z
      .object({
        previousRange: z.object({ from: z.string(), to: z.string() }),
        values: z.array(MeasureValueSchema),
      })
      .nullable()
      .optional(),
    /** Categorical rows (bounded by `limit`). */
    rows: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          workflowState: z.string().nullable(),
          value: MeasureValueSchema,
          /** Underlying run count for the row (ranking/derivation context). */
          runs: z.number().int().nonnegative(),
        }),
      )
      .optional(),
    warnings: z.array(z.string()),
    /** True when categorical rows were capped (more groups exist). */
    truncated: z.boolean(),
  })
  .strict();
export type AnalyticsQueryResult = z.infer<typeof AnalyticsQueryResultSchema>;
