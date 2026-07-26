import type { InsightWidgetConfig } from "@/contracts/analytics";
import type { ConnectedAnalyticsQuery } from "@/contracts/connectedAnalytics";
import {
  findDataset,
  findMeasure,
  findSource,
  type InsightCatalog,
} from "./insightCatalog";
import {
  customRangeToWireRange,
  validateCustomRange,
} from "@/core/analytics/insightRange";
import { DEFAULT_INSIGHT_RANGE, type InsightDraft } from "./reconcileInsightConfig";

/**
 * Centralized query construction (CD-3A). Both the live preview and the saved
 * widget build their `ConnectedAnalyticsQuery` HERE, from the same persisted
 * shape — so what the user previews is what the widget asks forever after.
 * Pure; no I/O.
 */

/**
 * A complete, saveable config from the draft — or null while incomplete.
 *
 * `maxRangeDays` is the selected dataset's ceiling; pass it so an out-of-bounds
 * or backwards custom range can never be persisted (CD-5A — previously the
 * preview was blocked but Apply stayed enabled, so a broken range was saved and
 * only failed later, on the dashboard).
 */
export function insightConfigFromDraft(
  draft: InsightDraft,
  maxRangeDays?: number,
): InsightWidgetConfig | null {
  if (!draft.source || !draft.dataset || !draft.measure || !draft.chart) return null;
  if (
    "from" in draft.range &&
    maxRangeDays !== undefined &&
    validateCustomRange(draft.range.from, draft.range.to, maxRangeDays) !== null
  ) {
    return null;
  }
  // Shape guards mirror the server's chart rules (validateQuery.ts).
  if (draft.chart === "line" && draft.dimension !== "time") return null;
  if (draft.chart === "kpi" && draft.dimension !== null) return null;
  if (draft.chart === "donut" && (draft.dimension === null || draft.dimension === "time")) {
    return null;
  }
  if (draft.chart === "bar" && draft.dimension === null) return null;
  if (draft.series?.mode === "explicit" && !draft.series.ids?.length) return null;
  const filters = Object.fromEntries(
    Object.entries(draft.filters).filter(
      ([, v]) => v === true || v === false || (Array.isArray(v) && v.length > 0),
    ),
  );
  return {
    source: draft.source,
    dataset: draft.dataset,
    measure: draft.measure,
    dimension: draft.dimension,
    ...(draft.dimension === "time" && draft.dateField !== undefined
      ? { dateField: draft.dateField }
      : {}),
    ...(draft.dimension === "time" && draft.timeGrain !== "auto"
      ? { timeGrain: draft.timeGrain }
      : {}),
    ...(Object.keys(filters).length > 0 ? { filters } : {}),
    ...(draft.series
      ? {
          series: {
            by: draft.series.by,
            ...(draft.series.mode !== undefined ? { mode: draft.series.mode } : {}),
            ...(draft.series.mode === "explicit" && draft.series.ids
              ? { ids: draft.series.ids }
              : {}),
            ...(draft.series.mode === "top" && draft.series.topN !== undefined
              ? { topN: draft.series.topN }
              : {}),
          },
        }
      : {}),
    range: draft.range,
    ...(draft.compare ? { compare: "previous_period" as const } : {}),
    ...(draft.sort && draft.dimension !== null && draft.dimension !== "time"
      ? { sort: { ...draft.sort } }
      : {}),
    chart: draft.chart,
  };
}

/**
 * The one query shape both preview and saved widgets send.
 *
 * THE inclusive-end translation lives here (CD-5A): a saved custom range stores
 * the end date the person picked ("to July 31", meaning July 31 counts), and
 * this is the single place it becomes the engine's exclusive `[from, to)`
 * boundary. Presets pass through — the server resolves them from the same
 * shared definition the builder used to describe them.
 */
export function insightQueryFromConfig(config: InsightWidgetConfig): ConnectedAnalyticsQuery {
  const storedRange = config.range ?? DEFAULT_INSIGHT_RANGE;
  const range =
    "from" in storedRange
      ? customRangeToWireRange(storedRange.from, storedRange.to)
      : storedRange;
  return {
    source: config.source,
    dataset: config.dataset,
    measure: config.measure,
    dimension: config.dimension,
    ...(config.dateField !== undefined ? { dateField: config.dateField } : {}),
    ...(config.timeGrain !== undefined ? { timeGrain: config.timeGrain } : {}),
    ...(config.filters !== undefined ? { filters: config.filters } : {}),
    ...(config.series !== undefined ? { series: config.series } : {}),
    range,
    ...(config.compare === "previous_period" ? { compare: "previous_period" as const } : {}),
    ...(config.sort !== undefined ? { sort: config.sort } : {}),
    ...(config.limit !== undefined ? { limit: config.limit } : {}),
    chart: config.chart,
  };
}

/**
 * Local pre-flight issues that make a draft not-yet-queryable. These GATE the
 * preview (no locally-invalid request is sent) and phrase what to do next;
 * the server stays authoritative for anything deeper.
 */
export function insightDraftIssues(catalog: InsightCatalog, draft: InsightDraft): string[] {
  const issues: string[] = [];
  const source = findSource(catalog, draft.source);
  if (!source) return ["Choose where your data comes from."];
  const dataset = findDataset(source, draft.dataset);
  if (!dataset) return ["Choose what you want to look at."];
  const measure = findMeasure(dataset, draft.measure);
  if (!measure) return ["Choose what the chart should show."];
  if (!draft.chart) issues.push("Choose how to display it.");
  if (draft.series?.mode === "explicit" && !draft.series.ids?.length) {
    issues.push("Choose at least one item to get its own line.");
  }
  if ("from" in draft.range) {
    // Inclusive end date: start === end is a valid single day (CD-5A).
    const rangeIssue = validateCustomRange(
      draft.range.from,
      draft.range.to,
      dataset.limits.maxRangeDays,
    );
    if (rangeIssue) issues.push(rangeIssue);
  }
  return issues;
}
