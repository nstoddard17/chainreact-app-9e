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

// ── Widgets ──────────────────────────────────────────────────────────────────

/** Visual shape of a widget. Mirrors the design's widget library. */
export const AnalyticsWidgetTypeSchema = z.enum([
  "stat",
  "line",
  "bar",
  "donut",
  "heatmap",
  "table",
  "activity",
  "note",
]);
export type AnalyticsWidgetType = z.infer<typeof AnalyticsWidgetTypeSchema>;

/** Grid footprint. Mirrors the design's resize options (cols×rows). */
export const AnalyticsWidgetSizeSchema = z.enum(["s", "m", "l", "xl", "w", "tall"]);
export type AnalyticsWidgetSize = z.infer<typeof AnalyticsWidgetSizeSchema>;

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
 * Per-widget configuration. `source` is "any" (account-wide) or a specific
 * workflow id (honored for scalar metrics via the overview's per-workflow
 * breakdown). `note` holds free text for note widgets.
 *
 * `.strict()` rejects unknown keys so a malformed payload 400s rather than
 * silently persisting junk into the JSONB column.
 *
 * FORWARD-COMPAT — connected-app analytics data sources are a planned additive
 * extension. The future shape replaces this flat binding with a discriminated
 * `dataSource` ({kind:"internal"|"connected_app", …}) where ABSENCE reads as
 * "internal" → no backfill, and needs NO DB migration (widgets is opaque JSONB).
 * No speculative fields are added now. Full design + adapter contract + authz +
 * caching rules: docs/slices/phase-4/analytics/analytics-closeout.md.
 */
export const AnalyticsWidgetConfigSchema = z
  .object({
    source: z.union([z.literal("any"), z.string().uuid()]).default("any"),
    metric: AnalyticsMetricSchema.optional(),
    note: z.string().max(2000).optional(),
  })
  .strict();
export type AnalyticsWidgetConfig = z.infer<typeof AnalyticsWidgetConfigSchema>;

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
  })
  .strict();
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

/** Range presets mirrored from the page's top-level selector. */
export const AnalyticsRangeSchema = z.enum(["today", "7d", "30d", "90d", "ytd"]);
export type AnalyticsRange = z.infer<typeof AnalyticsRangeSchema>;

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
