import type { InsightWidgetConfig } from "@/contracts/analytics";
import type { ConnectedAnalyticsQuery } from "@/contracts/connectedAnalytics";
import {
  findDataset,
  findMeasure,
  findSource,
  type InsightCatalog,
} from "./insightCatalog";
import { DEFAULT_INSIGHT_RANGE, type InsightDraft } from "./reconcileInsightConfig";

/**
 * Centralized query construction (CD-3A). Both the live preview and the saved
 * widget build their `ConnectedAnalyticsQuery` HERE, from the same persisted
 * shape — so what the user previews is what the widget asks forever after.
 * Pure; no I/O.
 */

const DAY_MS = 86_400_000;

/** A complete, saveable config from the draft — or null while incomplete. */
export function insightConfigFromDraft(draft: InsightDraft): InsightWidgetConfig | null {
  if (!draft.source || !draft.dataset || !draft.measure || !draft.chart) return null;
  if (draft.chart === "line" && draft.dimension !== "time") return null;
  if (draft.chart === "kpi" && draft.dimension !== null) return null;
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
    chart: draft.chart,
  };
}

/** The one query shape both preview and saved widgets send. */
export function insightQueryFromConfig(config: InsightWidgetConfig): ConnectedAnalyticsQuery {
  return {
    source: config.source,
    dataset: config.dataset,
    measure: config.measure,
    dimension: config.dimension,
    ...(config.dateField !== undefined ? { dateField: config.dateField } : {}),
    ...(config.timeGrain !== undefined ? { timeGrain: config.timeGrain } : {}),
    ...(config.filters !== undefined ? { filters: config.filters } : {}),
    ...(config.series !== undefined ? { series: config.series } : {}),
    range: config.range ?? DEFAULT_INSIGHT_RANGE,
    ...(config.compare === "previous_period" ? { compare: "previous_period" as const } : {}),
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
    const from = Date.parse(draft.range.from);
    const to = Date.parse(draft.range.to);
    if (Number.isNaN(from) || Number.isNaN(to)) {
      issues.push("Enter both custom dates.");
    } else if (from >= to) {
      issues.push("The range start must be before its end.");
    } else if (to - from > dataset.limits.maxRangeDays * DAY_MS) {
      issues.push(`The range can cover at most ${dataset.limits.maxRangeDays} days.`);
    }
  }
  return issues;
}
