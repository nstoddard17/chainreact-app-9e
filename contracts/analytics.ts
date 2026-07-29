import { z } from "zod";

/**
 * Cross-layer contracts for the Analytics page (Slice ANALYTICS-1).
 *
 * Two concerns:
 *   1. Saved dashboards + their widget layout (persisted, account-scoped) — the
 *      `AnalyticsDashboard` / `AnalyticsWidget` shapes stored in
 *      `analytics_dashboards.widgets` and exchanged over the dashboards API.
 *   2. The computed `AnalyticsOverview` — real, account-scoped metrics derived at
 *      read time from the account's runs / workflows / integrations. Widgets bind
 *      to a slice of this via their `metric` (+ optional workflow `source`); the
 *      DB never stores live values, only structural widget config.
 *
 * NOTHING here carries credentials, tokens, provider labels/emails, or run
 * payloads — widgets reference data by metric id + optional workflow id only.
 */

/** Range presets mirrored from the page's top-level selector. (Declared ahead
 * of the widget section — the Custom Insight config reuses it.) */
export const AnalyticsRangeSchema = z.enum(["today", "7d", "30d", "90d", "ytd"]);
export type AnalyticsRange = z.infer<typeof AnalyticsRangeSchema>;

// ── Widgets ──────────────────────────────────────────────────────────────────

/** Visual shape of a widget. Mirrors the design's widget library. `insight` is
 * the catalog-driven Custom Insight (CD-3A) — its data binding lives in
 * `config.insight`, not in the legacy `metric` field. */
export const AnalyticsWidgetTypeSchema = z.enum([
  "stat",
  "line",
  "bar",
  "donut",
  "heatmap",
  "table",
  "activity",
  "note",
  "insight",
]);
export type AnalyticsWidgetType = z.infer<typeof AnalyticsWidgetTypeSchema>;

/** Grid footprint. Mirrors the design's resize options (cols×rows). */
export const AnalyticsWidgetSizeSchema = z.enum(["s", "m", "l", "xl", "w", "tall"]);
export type AnalyticsWidgetSize = z.infer<typeof AnalyticsWidgetSizeSchema>;

/**
 * The canonical persisted grid width (ANALYTICS-EXPLICIT-LAYOUT-S2-CONTRACT-1).
 *
 * ONE layout is authored and stored at this width, whatever device authored it.
 * Narrower viewports are render-time projections that never write back. It lives
 * in `contracts/` — not in the layout engine — because the persisted shape's
 * validity depends on it: `x + w` may not exceed it. The engine re-exports this
 * constant rather than declaring its own.
 */
export const ANALYTICS_CANONICAL_COLUMNS = 4;

/** Columns × rows a size preset reserves on the canonical grid. */
export interface AnalyticsWidgetFootprint {
  readonly w: number;
  readonly h: number;
}

/**
 * What each stored size preset MEANS as grid cells — the single definition in
 * the codebase. Migration, validation, rendering, drag, resize and add-widget
 * all read footprints from here; nothing re-derives them. The values are the
 * ones the shipped `SIZE_GRID_CLASS` Tailwind spans have always produced, and a
 * test asserts the two agree preset for preset until the class map is retired.
 */
export const ANALYTICS_SIZE_FOOTPRINT: Readonly<
  Record<AnalyticsWidgetSize, AnalyticsWidgetFootprint>
> = {
  s: { w: 1, h: 1 },
  m: { w: 2, h: 1 },
  l: { w: 2, h: 2 },
  xl: { w: 3, h: 1 },
  w: { w: 4, h: 1 },
  tall: { w: 1, h: 2 },
};

/** The footprint a size preset reserves, as columns × rows. */
export function footprintForSize(size: AnalyticsWidgetSize): AnalyticsWidgetFootprint {
  return ANALYTICS_SIZE_FOOTPRINT[size];
}

/**
 * Explicit placement on the canonical grid. OPTIONAL on a widget: boards
 * authored before explicit placement carry only an array order plus a `size`
 * preset, and are never rewritten merely because they were read.
 *
 * `x`/`y` are the widget's own coordinates. `w`/`h` are validated against
 * `size` on the widget itself (see `AnalyticsWidgetSchema`) so dimensions can
 * never have two competing sources of truth while both fields exist.
 */
export const AnalyticsWidgetLayoutSchema = z
  .object({
    x: z.number().int().min(0),
    y: z.number().int().min(0),
    w: z.number().int().min(1).max(ANALYTICS_CANONICAL_COLUMNS),
    h: z.number().int().min(1),
  })
  .strict()
  .refine((r) => r.x + r.w <= ANALYTICS_CANONICAL_COLUMNS, {
    message: `A widget may not extend past column ${ANALYTICS_CANONICAL_COLUMNS}.`,
  });
export type AnalyticsWidgetLayout = z.infer<typeof AnalyticsWidgetLayoutSchema>;

/**
 * The metric a data-bound widget renders. Only metrics the aggregation service
 * actually backs are listed (no-fake-UI): each maps to a real slice of
 * `AnalyticsOverview`. `note` widgets carry no metric.
 *
 * Deferred design metrics not yet backed (NOT offered in the config panel):
 * `time_saved` (no estimation model), `by_owner` (per-creator attribution),
 * `errors` (distinct retry/error ledger). Documented as follow-ups.
 */
export const AnalyticsMetricSchema = z.enum([
  "runs", // total runs in range
  "success_rate", // succeeded / total
  "active_workflows", // active workflows in the account
  "avg_duration", // average run duration
  "outcomes", // succeeded vs failed split
  "runs_over_time", // daily run buckets
  "top_workflows", // workflows ranked by runs
  "by_time", // day × week activity heatmap
  "by_app", // connected apps (connection-level)
  "events", // recent runs feed
]);
export type AnalyticsMetric = z.infer<typeof AnalyticsMetricSchema>;

/**
 * A widget's DATA SOURCE — the discriminated forward-compat seam for
 * connected-app analytics (Slice ANALYTICS-SOURCES-1).
 *
 *   - `internal` — ChainReact's own workflow/run analytics (the legacy flat
 *     `source` + `metric` fields below carry the internal binding).
 *   - `connected_app` — a read-only metric from a connected provider, resolved at
 *     runtime through the analytics SOURCE REGISTRY
 *     (services/analytics/sources/registry.ts). `provider` + `metricKey` are
 *     validated against the registry's APPROVED list — never used to invoke an
 *     arbitrary provider method, URL, or workflow node. `filters` / `groupBy` are
 *     opaque here and validated per-metric by the adapter.
 *
 * ABSENCE of `dataSource` ⇒ internal (every existing widget reads unchanged —
 * no backfill, no DB migration; `widgets` is opaque JSONB). Connected-app widget
 * CREATION is NOT exposed in the UI yet (no real provider source shipped this
 * slice).
 */
export const AnalyticsWidgetDataSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("internal") }).strict(),
  z
    .object({
      kind: z.literal("connected_app"),
      provider: z.string().min(1).max(60),
      metricKey: z.string().min(1).max(80),
      groupBy: z.string().max(60).optional(),
      filters: z
        .record(z.union([z.string(), z.number(), z.boolean()]))
        .optional(),
    })
    .strict(),
]);
export type AnalyticsWidgetDataSource = z.infer<typeof AnalyticsWidgetDataSourceSchema>;

// ── Custom Insight (CD-3A) ───────────────────────────────────────────────────

/**
 * Insight display types. CD-3A shipped kpi + line; CD-3B adds bar, the
 * user-selectable table, and the catalog-gated donut. Availability per query
 * always comes from the dataset's declared `charts` (+ part-to-whole for
 * donut) — this enum only bounds what the renderer can draw.
 */
export const InsightChartTypeSchema = z.enum(["kpi", "line", "bar", "table", "donut"]);
export type InsightChartType = z.infer<typeof InsightChartTypeSchema>;

const InsightId = z.string().min(1).max(60);

/**
 * Range presets a Custom Insight may persist (CD-5A).
 *
 * A SUPERSET of `AnalyticsRangeSchema` — every id the legacy dashboard selector
 * uses is still here, so every previously saved Insight keeps parsing AND keeps
 * meaning exactly what it meant. The added ids are the calendar-anchored ranges
 * people actually ask for.
 *
 * Each one resolves in `core/analytics/insightRange.ts`, which the builder and
 * the server share, so a preset can never mean one thing in the chart and
 * another in the query. The legacy dashboard-wide enum is deliberately NOT
 * widened — it drives the internal overview path, which has its own resolver.
 */
export const InsightRangePresetSchema = z.enum([
  "today",
  "yesterday",
  "7d",
  "30d",
  "90d",
  "this_month",
  "last_month",
  "ytd",
  "12m",
]);
export type InsightRangePresetId = z.infer<typeof InsightRangePresetSchema>;

/**
 * Mirrors `ConnectedAnalyticsQuery.range` (contracts/connectedAnalytics.ts).
 *
 * For a custom range, `to` is the user's INCLUSIVE end date — "to July 31"
 * includes July 31. The translator in `insightQueryFromConfig` converts it to
 * the exclusive UTC instant the query engine works in, so nobody has to
 * understand `[from, to)` to get the range they asked for.
 */
export const InsightRangeSchema = z.union([
  z.object({ preset: InsightRangePresetSchema }).strict(),
  z.object({ from: z.string().min(1).max(40), to: z.string().min(1).max(40) }).strict(),
]);
export type InsightRange = z.infer<typeof InsightRangeSchema>;

export const InsightSeriesConfigSchema = z
  .object({
    by: InsightId,
    /** Omitted = the dataset's automatic mode (every value is a series). */
    mode: z.enum(["top", "explicit"]).optional(),
    ids: z.array(z.string().min(1).max(120)).min(1).max(8).optional(),
    topN: z.number().int().min(1).max(8).optional(),
  })
  .strict();
export type InsightSeriesConfig = z.infer<typeof InsightSeriesConfigSchema>;

/**
 * The persisted Custom Insight question (CD-3A): source → dataset → measure →
 * grouping → filters → series → time → chart. Every id references the
 * connected-analytics CATALOG and is re-validated server-side on every query —
 * persistence never grants capability.
 *
 * ONLY the user's intended question is stored. By construction (`.strict()` +
 * these fields only) the config can never carry account/user/integration ids,
 * tokens, provider responses, chart rows, names-as-authority, freshness,
 * errors, or generated colors — contract-tested.
 */
export const InsightWidgetConfigSchema = z
  .object({
    source: InsightId,
    dataset: InsightId,
    measure: InsightId,
    /** "time", a category dimension id, or null for a single number. */
    dimension: InsightId.nullable(),
    dateField: InsightId.optional(),
    timeGrain: z.enum(["auto", "day", "week", "month"]).optional(),
    /** Keys are catalog filter ids; values typed per filter definition. */
    filters: z
      .record(z.union([z.array(z.string().min(1).max(120)).min(1).max(20), z.boolean()]))
      .optional(),
    series: InsightSeriesConfigSchema.optional(),
    /** Omitted = the builder's default preset (the widget's own range — an
     * Insight does not follow the dashboard's global range selector). */
    range: InsightRangeSchema.optional(),
    compare: z.literal("previous_period").nullable().optional(),
    /** Category-breakdown ordering (CD-3B). Mirrors the connected query's
     * `sort`; only meaningful for a categorical grouping — the server rejects
     * it otherwise, so it is never persisted for KPI/time shapes. */
    sort: z
      .object({ by: z.enum(["value", "label"]), dir: z.enum(["asc", "desc"]) })
      .strict()
      .optional(),
    /** Category-row cap (CD-3B); bounded by the dataset's maxCategoryRows. */
    limit: z.number().int().min(1).max(50).optional(),
    chart: InsightChartTypeSchema,
  })
  .strict();
export type InsightWidgetConfig = z.infer<typeof InsightWidgetConfigSchema>;

/**
 * Per-widget configuration. `source` is "any" (account-wide) or a specific
 * workflow id (honored for scalar metrics via the overview's per-workflow
 * breakdown). `note` holds free text for note widgets. `dataSource` is the
 * forward-compat discriminated source (above); when omitted the widget is
 * internal, preserving every existing widget verbatim.
 *
 * `.strict()` rejects unknown keys so a malformed payload 400s rather than
 * silently persisting junk into the JSONB column.
 */
export const AnalyticsWidgetConfigSchema = z
  .object({
    source: z.union([z.literal("any"), z.string().uuid()]).default("any"),
    metric: AnalyticsMetricSchema.optional(),
    note: z.string().max(2000).optional(),
    dataSource: AnalyticsWidgetDataSourceSchema.optional(),
    /** Custom Insight binding (type "insight"). Absent while the widget is
     * newly added and not yet configured — the body renders a guided empty
     * state, never a query. */
    insight: InsightWidgetConfigSchema.optional(),
  })
  .strict();
export type AnalyticsWidgetConfig = z.infer<typeof AnalyticsWidgetConfigSchema>;

/**
 * The effective source kind of a widget. Absent `dataSource` ⇒ "internal" (the
 * legacy shape), so existing widgets resolve correctly. Single chokepoint so the
 * UI + future data-fetch layer never re-derive this inconsistently.
 */
export function widgetSourceKind(
  config: AnalyticsWidgetConfig,
): "internal" | "connected_app" {
  return config.dataSource?.kind === "connected_app" ? "connected_app" : "internal";
}

export const AnalyticsWidgetSchema = z
  .object({
    /** Client-generated stable id (used as React key + drag/reorder anchor). */
    id: z.string().min(1).max(64),
    type: AnalyticsWidgetTypeSchema,
    size: AnalyticsWidgetSizeSchema,
    title: z.string().min(1).max(120),
    /** Icon key from the shared analytics icon set (optional). */
    icon: z.string().max(40).optional(),
    config: AnalyticsWidgetConfigSchema.default({ source: "any" }),
    /**
     * Explicit placement on the canonical grid
     * (ANALYTICS-EXPLICIT-LAYOUT-S2-CONTRACT-1). ABSENT on every board authored
     * before explicit placement — those keep deriving position from array order
     * and `size`, and a read never adds this field.
     */
    layout: AnalyticsWidgetLayoutSchema.optional(),
  })
  .strict()
  .superRefine((widget, ctx) => {
    if (!widget.layout) return;
    // TRANSITIONAL RULE: while `size` is still the UI's preset control, the
    // stored rectangle's dimensions must MEAN the same thing the preset does.
    // Two sources of truth for width is precisely how the old system's preview
    // and commit came to disagree. `x`/`y` are the explicit part; `w`/`h` are
    // the preset's footprint, restated so the rectangle is self-contained.
    const expected = footprintForSize(widget.size);
    if (widget.layout.w !== expected.w || widget.layout.h !== expected.h) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["layout"],
        message:
          `Layout size ${widget.layout.w}×${widget.layout.h} does not match the "${widget.size}" ` +
          `preset (${expected.w}×${expected.h}).`,
      });
    }
  });
export type AnalyticsWidget = z.infer<typeof AnalyticsWidgetSchema>;

/** A widget board is capped to keep payloads + render bounded. */
export const AnalyticsWidgetsSchema = z.array(AnalyticsWidgetSchema).max(48);

// ── Dashboards ───────────────────────────────────────────────────────────────

export const AnalyticsDashboardSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  position: z.number().int().nonnegative(),
  isDefault: z.boolean(),
  widgets: AnalyticsWidgetsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AnalyticsDashboard = z.infer<typeof AnalyticsDashboardSchema>;

/** Body for POST /api/analytics/dashboards — create a new dashboard. */
export const CreateDashboardBodySchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(80),
    widgets: AnalyticsWidgetsSchema.optional(),
  })
  .strict();
export type CreateDashboardBody = z.infer<typeof CreateDashboardBodySchema>;

/**
 * Body for PATCH /api/analytics/dashboards/[id] — rename and/or replace the
 * widget layout atomically (the "Done editing" save). Both fields optional so
 * a rename and a layout save can be independent calls.
 */
export const UpdateDashboardBodySchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(80).optional(),
    widgets: AnalyticsWidgetsSchema.optional(),
    position: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(
    (d) => d.name !== undefined || d.widgets !== undefined || d.position !== undefined,
    { message: "Nothing to update." },
  );
export type UpdateDashboardBody = z.infer<typeof UpdateDashboardBodySchema>;

// ── Computed overview (read-time aggregation) ────────────────────────────────

export const AnalyticsTotalsSchema = z.object({
  runs: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  /** 0..1. 0 when there are no runs. */
  successRate: z.number().min(0).max(1),
  /** Mean run duration in ms over finished runs in range, or null when none. */
  avgDurationMs: z.number().nonnegative().nullable(),
  activeWorkflows: z.number().int().nonnegative(),
  totalWorkflows: z.number().int().nonnegative(),
  connectedApps: z.number().int().nonnegative(),
});
export type AnalyticsTotals = z.infer<typeof AnalyticsTotalsSchema>;

export const AnalyticsTimePointSchema = z.object({
  /** ISO date (YYYY-MM-DD), UTC bucket. */
  date: z.string(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export type AnalyticsTimePoint = z.infer<typeof AnalyticsTimePointSchema>;

export const AnalyticsWorkflowStatSchema = z.object({
  workflowId: z.string().uuid(),
  name: z.string(),
  runs: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  avgDurationMs: z.number().nonnegative().nullable(),
});
export type AnalyticsWorkflowStat = z.infer<typeof AnalyticsWorkflowStatSchema>;

export const AnalyticsAppStatSchema = z.object({
  provider: z.string(),
  label: z.string(),
  /** Number of connected accounts for this provider (connection-level). */
  connections: z.number().int().nonnegative(),
});
export type AnalyticsAppStat = z.infer<typeof AnalyticsAppStatSchema>;

export const AnalyticsRecentRunSchema = z.object({
  id: z.string().uuid(),
  workflowName: z.string(),
  status: z.enum(["succeeded", "failed"]),
  startedAt: z.string(),
  durationMs: z.number().nonnegative().nullable(),
});
export type AnalyticsRecentRun = z.infer<typeof AnalyticsRecentRunSchema>;

/**
 * Calendar-style activity heatmap: `weeks` columns × 7 day-rows, newest week
 * last. `cells[w*7 + d]` is the run count for that day; `maxCell` is the busiest
 * day's count (for client intensity normalization, avoiding a divide-by-zero).
 */
export const AnalyticsHeatmapSchema = z.object({
  weeks: z.number().int().positive(),
  cells: z.array(z.number().int().nonnegative()),
  maxCell: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type AnalyticsHeatmap = z.infer<typeof AnalyticsHeatmapSchema>;

export const AnalyticsOverviewSchema = z.object({
  range: z.object({
    id: AnalyticsRangeSchema,
    since: z.string(),
    until: z.string(),
  }),
  totals: AnalyticsTotalsSchema,
  /** Same metrics over the immediately-preceding equal-length window (trend %). */
  previousTotals: AnalyticsTotalsSchema,
  runsOverTime: z.array(AnalyticsTimePointSchema),
  /** All workflows with ≥1 run in range, ranked by runs desc. */
  workflows: z.array(AnalyticsWorkflowStatSchema),
  apps: z.array(AnalyticsAppStatSchema),
  heatmap: AnalyticsHeatmapSchema,
  recentRuns: z.array(AnalyticsRecentRunSchema),
  /** True when the run window hit the read cap (aggregates may undercount). */
  truncated: z.boolean(),
});
export type AnalyticsOverview = z.infer<typeof AnalyticsOverviewSchema>;
