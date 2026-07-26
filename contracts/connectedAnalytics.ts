import { z } from "zod";
import { InsightRangePresetSchema } from "./analytics";
import { AnalyticsChartTypeSchema, AnalyticsValueUnitSchema } from "./analyticsCatalog";

/**
 * Provider-agnostic connected analytics QUERY + RESULT contracts
 * (Slice ANALYTICS-CONNECTED-DATA-CD-1).
 *
 * One request/result wire shape for EVERY analytics source (ChainReact
 * workflow runs today; Stripe/Shopify/QuickBooks/HubSpot/Motive datasets in
 * later slices). Design: audit §9/§10. Same hard rules as the CS-1 contract:
 * `.strict()` everywhere; NO account/user/connection ids from the client; no
 * raw field names, arbitrary filter keys, operations, or SQL; bounded series
 * (≤8), custom range (≤366d), rows and buckets; time windows [from, to).
 * Measure/dimension/filter ids reference the dataset CATALOG and are
 * validated server-side against it — never trusted.
 */

const Id = z.string().min(1).max(60);

export const ConnectedAnalyticsQuerySchema = z
  .object({
    source: Id,
    dataset: Id,
    measure: Id,
    /** Dimension id, "time", or null for a KPI. */
    dimension: Id.nullable(),
    /** Which declared date field drives time; default = first historical. */
    dateField: Id.optional(),
    timeGrain: z.enum(["auto", "day", "week", "month"]).optional(),
    /** Keys must be catalog filter ids; values typed per filter definition. */
    filters: z
      .record(z.union([z.array(z.string().min(1).max(120)).min(1).max(20), z.boolean()]))
      .optional(),
    series: z
      .object({
        by: Id,
        mode: z.enum(["top", "explicit"]).optional(),
        ids: z.array(z.string().min(1).max(120)).min(1).max(8).optional(),
        topN: z.number().int().min(1).max(8).optional(),
      })
      .strict()
      .optional(),
    /**
     * Preset, or an explicit `[from, to)` window. On this wire `to` is the
     * EXCLUSIVE boundary — the builder's inclusive end date is translated once,
     * in `insightQueryFromConfig`, before the query is built.
     */
    range: z.union([
      z.object({ preset: InsightRangePresetSchema }).strict(),
      z
        .object({
          from: z.string().min(1).max(40),
          to: z.string().min(1).max(40),
        })
        .strict(),
    ]),
    compare: z.literal("previous_period").nullable().optional(),
    /** Optional render intent — validated against the dataset's chart list. */
    chart: AnalyticsChartTypeSchema.optional(),
    sort: z
      .object({ by: z.enum(["value", "label"]), dir: z.enum(["asc", "desc"]) })
      .strict()
      .optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();
export type ConnectedAnalyticsQuery = z.infer<typeof ConnectedAnalyticsQuerySchema>;

// ── Result ───────────────────────────────────────────────────────────────────

export const ConnectedValueMetaSchema = z
  .object({
    unit: AnalyticsValueUnitSchema,
    /** ISO currency code when unit is "currency" and known. */
    currency: z.string().length(3).optional(),
  })
  .strict();
export type ConnectedValueMeta = z.infer<typeof ConnectedValueMetaSchema>;

export const ConnectedFreshnessSchema = z
  .object({
    mode: z.enum(["live", "cached"]),
    ageSeconds: z.number().nonnegative().nullable().optional(),
    ttlSeconds: z.number().nonnegative().nullable().optional(),
    stale: z.boolean().optional(),
  })
  .strict();
export type ConnectedFreshness = z.infer<typeof ConnectedFreshnessSchema>;

/** STRUCTURED completeness — partial data is never only a warning sentence. */
export const ConnectedCompletenessSchema = z
  .object({
    state: z.enum([
      "complete",
      "scan_capped",
      "row_capped",
      "provider_sampled",
      "partially_synced",
    ]),
    detail: z.string().max(200).optional(),
  })
  .strict();
export type ConnectedCompleteness = z.infer<typeof ConnectedCompletenessSchema>;

const CellValue = z.number().nullable();
const RangeIso = z.object({ from: z.string(), to: z.string() }).strict();

/**
 * Server-issued drill refinement for one categorical row or one series
 * (Slice ANALYTICS-CONNECTED-DATA-CD-5B).
 *
 * A chart value is explorable ONLY when it carries one of these. The server
 * attaches it from validated catalog knowledge — a bounded category value, or
 * an entity id the catalog explicitly declares to double as its own filter
 * value. The client never guesses a filter value from a display label, and a
 * row without a refinement (e.g. QuickBooks customers, whose row ids are
 * per-account surrogates that deliberately can't be turned back into provider
 * ids) is simply an ordinary readable value.
 *
 * GUIDANCE, NOT AUTHORIZATION: the refined query the client builds from this
 * goes through the normal query route and the full server-side validator like
 * any hand-built query. By construction this shape can carry no account /
 * integration / connection id, scope, endpoint, cursor, payload or free-form
 * provider query syntax — only a declared filter key and one bounded value.
 *
 * Time buckets need no refinement object: `buckets[].start/end` (and
 * `compareSeries.buckets[]` for the previous window) ARE the server-supplied
 * exact boundaries a time drill uses verbatim.
 */
export const ConnectedRefineSchema = z
  .object({
    /** Declared catalog filter id on this dataset. */
    filterKey: z.string().min(1).max(60),
    /** The canonical value the filter expects — never a display label. */
    filterValue: z.string().min(1).max(120),
    /** Customer-facing description of the value ("Paid", "Daily digest"). */
    label: z.string().min(1).max(120),
  })
  .strict();
export type ConnectedRefine = z.infer<typeof ConnectedRefineSchema>;

export const ConnectedAnalyticsResultSchema = z
  .object({
    kind: z.enum(["kpi", "time_series", "categorical", "table"]),
    source: z
      .object({
        sourceId: z.string(),
        sourceLabel: z.string(),
        datasetId: z.string(),
        datasetLabel: z.string(),
        attributionPrefix: z.string().optional(),
      })
      .strict(),
    measure: z.object({ id: z.string(), label: z.string() }).strict(),
    dimension: z.string().nullable(),
    grain: z.enum(["day", "week", "month"]).nullable(),
    range: RangeIso,
    valueMeta: ConnectedValueMetaSchema,
    freshness: ConnectedFreshnessSchema,
    completeness: ConnectedCompletenessSchema,
    // kpi
    value: CellValue.optional(),
    compare: z
      .object({ previousValue: CellValue, previousRange: RangeIso })
      .strict()
      .nullable()
      .optional(),
    // time series
    buckets: z
      .array(z.object({ start: z.string(), end: z.string(), label: z.string() }).strict())
      .optional(),
    series: z
      .array(
        z
          .object({
            id: z.string(),
            label: z.string(),
            entityState: z.string().nullable().optional(),
            values: z.array(CellValue),
            /** CD-5B: present only when selecting this series can refine safely. */
            refine: ConnectedRefineSchema.optional(),
          })
          .strict(),
      )
      .optional(),
    compareSeries: z
      .object({
        previousRange: RangeIso,
        values: z.array(CellValue),
        /**
         * The previous window's own bucket boundaries, index-aligned to the
         * current `buckets` (CD-5B). Selecting a previous-period point drills
         * into ITS real dates, never the visually aligned current dates — and
         * the browser never reconstructs calendar boundaries itself. Optional:
         * results cached before CD-5B simply leave previous points
         * non-drillable.
         */
        buckets: z
          .array(z.object({ start: z.string(), end: z.string(), label: z.string() }).strict())
          .optional(),
      })
      .strict()
      .nullable()
      .optional(),
    // categorical / table
    rows: z
      .array(
        z
          .object({
            id: z.string(),
            label: z.string(),
            entityState: z.string().nullable().optional(),
            value: CellValue,
            records: z.number().int().nonnegative().optional(),
            /** CD-5B: present only when selecting this row can refine safely. */
            refine: ConnectedRefineSchema.optional(),
          })
          .strict(),
      )
      .optional(),
    total: CellValue.optional(),
    /** Opaque token for a future drill-down slice; never raw record ids. */
    drilldown: z.string().max(500).nullable().optional(),
    warnings: z.array(z.string()),
  })
  .strict();
export type ConnectedAnalyticsResult = z.infer<typeof ConnectedAnalyticsResultSchema>;

/** Typed error every connected-analytics layer speaks. */
export type ConnectedAnalyticsErrorCode =
  | "UNKNOWN_SOURCE"
  | "UNKNOWN_DATASET"
  | "INVALID_QUERY"
  | "UNKNOWN_ENTITY"
  | "MISSING_CREDENTIAL"
  /** Connection exists but must be re-authorized (401/expired). */
  | "RECONNECT_REQUIRED"
  /** Provider-side 429 OR ChainReact's protective limiter (see retryAfterSeconds). */
  | "RATE_LIMITED"
  /** Monetary measure over >1 currency with no single-currency filter (CD-2). */
  | "MIXED_CURRENCY"
  | "PROVIDER_ERROR";

export class ConnectedAnalyticsError extends Error {
  readonly code: ConnectedAnalyticsErrorCode;
  /** For RATE_LIMITED: seconds until the caller may retry (protective limiter). */
  readonly retryAfterSeconds?: number;
  constructor(
    message: string,
    code: ConnectedAnalyticsErrorCode,
    opts: { retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = "ConnectedAnalyticsError";
    this.code = code;
    if (opts.retryAfterSeconds !== undefined) this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}
