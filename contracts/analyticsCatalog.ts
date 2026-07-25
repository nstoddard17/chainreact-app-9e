import { z } from "zod";

/**
 * Provider-agnostic analytics CATALOG contracts (Slice ANALYTICS-CONNECTED-DATA-CD-1).
 *
 * The declarative, CLIENT-SAFE description of what an analytics source can be
 * asked — designed in docs/slices/phase-5/analytics-connected-data-audit-1.md
 * (§6/§8). Hybrid curated-field model (approved decision D1): providers declare
 * a curated typed FIELD list; the platform mechanically derives safe standard
 * measures/dimensions/filters from it (contracts/analyticsCatalogDerive.ts);
 * providers may add NAMED derived measures (success rate, outstanding balance).
 * Users never see or select raw API fields.
 *
 * HARD RULES (enforced by `.strict()` schemas + registry validation +
 * tests):
 *   - No SQL, callbacks, credentials, tokens, account ids, raw provider
 *     payloads, or OAuth scope strings in this contract. Server-only concerns
 *     (required scopes, execution wiring) live on the ADAPTER registration in
 *     services/analytics/insights/, never here.
 *   - Sensitive/prohibited provider fields are EXCLUDED from catalogs
 *     entirely — there is deliberately no "sensitive: true" escape hatch.
 *   - Invalid analytics are unrepresentable: only `number` fields can be
 *     measurable; only bounded-cardinality category/entity/boolean fields can
 *     be dimensionable; only `historical` date fields can drive time charts.
 */

// ── Value semantics ──────────────────────────────────────────────────────────

export const AnalyticsValueUnitSchema = z.enum([
  "count",
  "percent",
  "currency",
  "milliseconds",
  "hours",
  "gallons",
  "miles",
  "decimal",
]);
export type AnalyticsValueUnit = z.infer<typeof AnalyticsValueUnitSchema>;

export const AnalyticsChartTypeSchema = z.enum(["kpi", "line", "bar", "table", "donut"]);
export type AnalyticsChartType = z.infer<typeof AnalyticsChartTypeSchema>;

export const AnalyticsAggregationSchema = z.enum(["sum", "avg", "min", "max"]);
export type AnalyticsAggregation = z.infer<typeof AnalyticsAggregationSchema>;

const Id = z.string().regex(/^[a-z][a-z0-9_]*$/, "ids are snake_case").max(60);
const Label = z.string().min(1).max(80);

// ── Curated fields ───────────────────────────────────────────────────────────

/**
 * One curated dataset field. `kind` gates what the field may legally do:
 *   - number   → may be `measurable` (with an explicit aggregation allow-list)
 *   - category/entity/boolean → may be `dimensionable` / `filterable`
 *   - date     → listed via `dateFields`, `historical` gates time charts
 *   - text     → display-only; NEVER measurable/dimensionable (free text is
 *                not a chart axis)
 * Identifiers are represented as `entity` references (label + stable id) —
 * there is no "id" kind to sum or average by construction.
 */
export const AnalyticsFieldSchema = z
  .object({
    id: Id,
    label: Label,
    kind: z.enum(["number", "category", "entity", "boolean", "text"]),
    description: z.string().max(300).optional(),
    nullable: z.boolean().default(false),
    // number-only
    unit: AnalyticsValueUnitSchema.optional(),
    /** "single": one currency per connection · "per_record": rows carry their own. */
    currencyBehavior: z.enum(["single", "per_record"]).optional(),
    measurable: z.boolean().default(false),
    aggregations: z.array(AnalyticsAggregationSchema).min(1).optional(),
    // category/entity/boolean-only
    dimensionable: z.boolean().default(false),
    /** Required when dimensionable — "high" cardinality can never be a dimension. */
    cardinality: z.enum(["low", "bounded", "high"]).optional(),
    filterable: z.boolean().default(false),
    /** entity-only: id of a registered options resolver powering the picker.
     * null = CD-3 supplies the picker from an existing safe listing (e.g. the
     * account workflow list) — never a client-invented list. */
    optionsSource: z.string().max(80).nullable().optional(),
    distinctCountable: z.boolean().default(false),
  })
  .strict()
  .superRefine((f, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (f.measurable && f.kind !== "number") bad(`field ${f.id}: only number fields are measurable`);
    if (f.aggregations && !f.measurable) bad(`field ${f.id}: aggregations require measurable`);
    if (f.measurable && !f.aggregations) bad(`field ${f.id}: measurable fields must allow-list aggregations`);
    if (f.measurable && !f.unit) bad(`field ${f.id}: measurable fields must declare a unit`);
    if (f.dimensionable && !["category", "entity", "boolean"].includes(f.kind)) {
      bad(`field ${f.id}: only category/entity/boolean fields are dimensionable`);
    }
    if (f.dimensionable && f.kind !== "boolean" && f.cardinality !== "low" && f.cardinality !== "bounded") {
      bad(`field ${f.id}: dimensionable fields need low/bounded cardinality`);
    }
    if (f.kind === "text" && (f.measurable || f.dimensionable || f.filterable)) {
      bad(`field ${f.id}: text fields are display-only`);
    }
    if (f.optionsSource !== undefined && f.kind !== "entity") {
      bad(`field ${f.id}: optionsSource applies to entity fields only`);
    }
    if (f.currencyBehavior && f.unit !== "currency") {
      bad(`field ${f.id}: currencyBehavior requires unit "currency"`);
    }
  });
export type AnalyticsField = z.infer<typeof AnalyticsFieldSchema>;

export const AnalyticsDateFieldSchema = z
  .object({
    id: Id,
    label: Label,
    /** Only historical date fields may drive time-series charts. */
    historical: z.boolean(),
  })
  .strict();
export type AnalyticsDateField = z.infer<typeof AnalyticsDateFieldSchema>;

// ── Named (provider-declared) measures ───────────────────────────────────────

export const AnalyticsNamedMeasureSchema = z
  .object({
    id: Id,
    label: Label,
    description: z.string().max(300).optional(),
    unit: AnalyticsValueUnitSchema,
    currencyBehavior: z.enum(["single", "per_record"]).optional(),
    /** Empty bucket/result semantics — counts are 0, rates/averages are null. */
    emptyValue: z.enum(["zero", "null"]),
    /** Dimension ids this measure supports; omitted = all dataset dimensions. */
    dimensions: z.array(Id).optional(),
    /** Filter ids that are INVALID for this measure (e.g. status on success_rate). */
    incompatibleFilters: z.array(Id).optional(),
    compare: z.boolean().default(false),
  })
  .strict();
export type AnalyticsNamedMeasure = z.infer<typeof AnalyticsNamedMeasureSchema>;

// ── Dataset / source ─────────────────────────────────────────────────────────

export const AnalyticsSeriesCapabilitySchema = z
  .object({
    /** Dimension id whose values become separate lines/groups. */
    by: Id,
    max: z.number().int().min(2).max(8),
    /** Empty = automatic (every value is a series, e.g. status). */
    modes: z.array(z.enum(["explicit", "top"])),
  })
  .strict();
export type AnalyticsSeriesCapability = z.infer<typeof AnalyticsSeriesCapabilitySchema>;

export const AnalyticsDatasetSchema = z
  .object({
    id: Id,
    label: Label,
    description: z.string().max(300).optional(),
    /** Plain noun for the derived count measure ("runs", "payments"). */
    recordNoun: z.string().min(1).max(40),
    fields: z.array(AnalyticsFieldSchema).max(40),
    dateFields: z.array(AnalyticsDateFieldSchema).min(1).max(6),
    namedMeasures: z.array(AnalyticsNamedMeasureSchema).max(20).default([]),
    /** Suppress the auto-derived `count` measure when a named one replaces it. */
    deriveCount: z.boolean().default(true),
    supportedCharts: z.array(AnalyticsChartTypeSchema).min(1),
    /** Donut is only offered over these dimension ids (true part-to-whole). */
    partToWholeDimensions: z.array(Id).default([]),
    series: z.array(AnalyticsSeriesCapabilitySchema).default([]),
    compare: z.boolean().default(false),
    queryLimits: z
      .object({
        maxRangeDays: z.number().int().min(1).max(366),
        maxBuckets: z.number().int().min(12).max(400),
        maxCategoryRows: z.number().int().min(5).max(50),
        maxRecordsScanned: z.number().int().positive().optional(),
      })
      .strict(),
    freshness: z
      .object({
        mode: z.enum(["live", "cached"]),
        ttlSeconds: z.number().int().nonnegative(),
      })
      .strict(),
    executionMode: z.enum(["local_sql", "provider_live", "provider_snapshot", "incremental_sync"]),
    previewSafe: z.boolean().default(true),
    drilldown: z.boolean().default(false),
    /** Friendly, user-facing note when extra permissions are needed. NEVER a
     * raw scope string — required scopes live server-side on the adapter. */
    scopeNote: z.string().max(200).optional(),
  })
  .strict();
export type AnalyticsDataset = z.infer<typeof AnalyticsDatasetSchema>;

export const AnalyticsSourceDefinitionSchema = z
  .object({
    id: Id,
    /** Integration provider key; null for the internal ChainReact source. */
    providerId: z.string().max(60).nullable(),
    label: Label,
    description: z.string().max(300).optional(),
    credentialMode: z.enum(["internal", "account", "personal"]),
    connectionRequired: z.boolean(),
    /** e.g. "Your Gmail" for personal sources; shown on widgets. */
    attributionPrefix: z.string().max(60).optional(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.credentialMode === "internal" && (s.providerId !== null || s.connectionRequired)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `source ${s.id}: internal sources have no provider and need no connection`,
      });
    }
    if (s.credentialMode !== "internal" && s.providerId === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `source ${s.id}: provider-backed sources must name a providerId`,
      });
    }
  });
export type AnalyticsSourceDefinition = z.infer<typeof AnalyticsSourceDefinitionSchema>;

export const AnalyticsSourceCatalogSchema = z
  .object({
    source: AnalyticsSourceDefinitionSchema,
    datasets: z.array(AnalyticsDatasetSchema).min(1).max(20),
  })
  .strict();
export type AnalyticsSourceCatalog = z.infer<typeof AnalyticsSourceCatalogSchema>;
