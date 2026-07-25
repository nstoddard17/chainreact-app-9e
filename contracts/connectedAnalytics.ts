import { z } from "zod";
import { AnalyticsRangeSchema } from "./analytics";
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
    range: z.union([
      z.object({ preset: AnalyticsRangeSchema }).strict(),
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
          })
          .strict(),
      )
      .optional(),
    compareSeries: z
      .object({ previousRange: RangeIso, values: z.array(CellValue) })
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
  | "PROVIDER_ERROR";

export class ConnectedAnalyticsError extends Error {
  readonly code: ConnectedAnalyticsErrorCode;
  constructor(message: string, code: ConnectedAnalyticsErrorCode) {
    super(message);
    this.name = "ConnectedAnalyticsError";
    this.code = code;
  }
}
