import {
  ANALYTICS_QUERY_DEFAULT_CATEGORY_ROWS,
  ANALYTICS_QUERY_DEFAULT_TOP_N,
  ANALYTICS_QUERY_MAX_RANGE_DAYS,
  type AnalyticsQuery,
  type AnalyticsQueryDimension,
  type AnalyticsQueryMeasure,
  type AnalyticsQuerySort,
} from "./analyticsQuery";

/**
 * Canonical measure × dimension capability matrix (ANALYTICS-FLEXIBILITY-CS-1).
 *
 * ONE definition consumed by BOTH sides: the future client greys out invalid
 * combinations from this matrix; the server independently rejects them through
 * `validateAnalyticsQuery` (never a silent fallback — product guardrail).
 *
 * This module is CLIENT-SAFE and contains NO SQL, NO authorization, and NO
 * secrets — authorization lives in the route/service; SQL lives in the
 * analytics repository/RPC only.
 */

export interface AnalyticsMeasureCapability {
  /** Human label ("Runs", "Success rate", …) for chart/legend copy. */
  label: string;
  /** Non-KPI dimensions this measure can be shown over. KPI (null) is always valid. */
  dimensions: readonly AnalyticsQueryDimension[];
  /** Series dimensions allowed on a time chart of this measure. */
  seriesBy: readonly ("workflow" | "status")[];
  /**
   * Whether a `statuses` filter is coherent. False for measures that already
   * fix or derive from status (filtering succeeded_runs to failed rows, or
   * distorting a success-rate denominator, would mislead).
   */
  statusFilterable: boolean;
  /** What an empty time bucket means: 0 (count of facts) or null (no data). */
  emptyBucket: "zero" | "null";
  /** Whether previous-period comparison is supported (KPI / single-series). */
  compare: boolean;
  /** Future stacked-bar eligibility: additive counts only. NOT used yet. */
  stackable: boolean;
}

export const ANALYTICS_MEASURE_CAPABILITIES: Readonly<
  Record<AnalyticsQueryMeasure, AnalyticsMeasureCapability>
> = {
  runs: {
    label: "Runs",
    dimensions: ["time", "workflow", "status", "trigger_source"],
    seriesBy: ["workflow", "status"],
    statusFilterable: true,
    emptyBucket: "zero",
    compare: true,
    stackable: true,
  },
  succeeded_runs: {
    label: "Successful runs",
    dimensions: ["time", "workflow", "trigger_source"],
    seriesBy: ["workflow"],
    statusFilterable: false,
    emptyBucket: "zero",
    compare: true,
    stackable: true,
  },
  failed_runs: {
    label: "Failed runs",
    dimensions: ["time", "workflow", "trigger_source"],
    seriesBy: ["workflow"],
    statusFilterable: false,
    emptyBucket: "zero",
    compare: true,
    stackable: true,
  },
  success_rate: {
    label: "Success rate",
    dimensions: ["time", "workflow", "trigger_source"],
    seriesBy: ["workflow"],
    statusFilterable: false,
    emptyBucket: "null",
    compare: true,
    stackable: false,
  },
  avg_duration_ms: {
    label: "Average duration",
    dimensions: ["time", "workflow", "status", "trigger_source"],
    seriesBy: ["workflow", "status"],
    statusFilterable: true,
    emptyBucket: "null",
    compare: true,
    stackable: false,
  },
};

const DAY_MS = 86_400_000;

/**
 * The fully-defaulted, cross-field-valid form of a query. Everything the
 * service needs is explicit: series mode/topN resolved, sort/limit defaulted
 * for categorical dimensions.
 */
export interface NormalizedAnalyticsQuery {
  measure: AnalyticsQueryMeasure;
  dimension: AnalyticsQueryDimension | null;
  /** "auto" preserved — the service resolves it once the window is known. */
  timeGrain: "auto" | "day" | "week" | "month" | null;
  series:
    | { by: "workflow"; mode: "explicit"; ids: readonly string[] }
    | { by: "workflow"; mode: "top"; topN: number }
    | { by: "status" }
    | null;
  filters: {
    workflowIds: readonly string[] | null;
    statuses: readonly ("succeeded" | "failed")[] | null;
    triggerSources: readonly string[] | null;
    includeTests: boolean;
  };
  range: AnalyticsQuery["range"];
  compare: "previous_period" | null;
  sort: AnalyticsQuerySort | null;
  limit: number | null;
}

export type AnalyticsQueryValidation =
  | { ok: true; query: NormalizedAnalyticsQuery }
  | { ok: false; reason: string };

function invalid(reason: string): AnalyticsQueryValidation {
  return { ok: false, reason };
}

/**
 * Cross-field validation + normalization over an already-schema-parsed query.
 * PURE — no I/O, no account context. Workflow OWNERSHIP (ids belong to the
 * caller's account) is deliberately NOT here: it needs the DB and lives in the
 * service. Every rejection carries plain, user-safe copy (surfaced verbatim by
 * the future builder UI).
 */
export function validateAnalyticsQuery(q: AnalyticsQuery): AnalyticsQueryValidation {
  const cap = ANALYTICS_MEASURE_CAPABILITIES[q.measure];

  // Dimension supported by the measure (KPI always allowed).
  if (q.dimension !== null && !cap.dimensions.includes(q.dimension)) {
    return invalid(
      `${cap.label} can't be shown over ${dimensionLabel(q.dimension)}.`,
    );
  }

  const isTime = q.dimension === "time";
  const isCategorical = q.dimension !== null && !isTime;

  // Time-only knobs.
  if (!isTime && q.timeGrain !== undefined) {
    return invalid("Time grouping only applies when showing results over time.");
  }
  if (!isTime && q.series !== undefined) {
    return invalid("Series only apply when showing results over time.");
  }

  // Categorical-only knobs.
  if (!isCategorical && q.sort !== undefined) {
    return invalid("Sorting only applies to a category breakdown.");
  }
  if (!isCategorical && q.limit !== undefined) {
    return invalid("Row limits only apply to a category breakdown.");
  }

  // Series rules.
  let series: NormalizedAnalyticsQuery["series"] = null;
  if (q.series) {
    if (!cap.seriesBy.includes(q.series.by)) {
      return invalid(
        `${cap.label} can't be split into ${q.series.by === "status" ? "status" : "workflow"} series.`,
      );
    }
    if (q.series.by === "status") {
      if (q.series.mode !== undefined || q.series.ids !== undefined || q.series.topN !== undefined) {
        return invalid("Status series don't take a mode, ids, or top-N.");
      }
      series = { by: "status" };
    } else if (q.series.mode === "explicit") {
      if (!q.series.ids || q.series.ids.length === 0) {
        return invalid("Choose at least one workflow for the series.");
      }
      if (q.series.topN !== undefined) {
        return invalid("Top-N doesn't apply when workflows are chosen explicitly.");
      }
      // An explicit series IS the workflow scope — a separate workflow filter
      // would either duplicate it or contradict it. (Top-N + filter is allowed:
      // "top N of these workflows".)
      if (q.filters.workflowIds !== undefined) {
        return invalid(
          "Choose the workflows in the series — a separate workflow filter doesn't combine with an explicit series.",
        );
      }
      series = { by: "workflow", mode: "explicit", ids: q.series.ids };
    } else if (q.series.mode === "top") {
      if (q.series.ids !== undefined) {
        return invalid("Explicit workflow ids don't apply in Top-N mode.");
      }
      series = {
        by: "workflow",
        mode: "top",
        topN: q.series.topN ?? ANALYTICS_QUERY_DEFAULT_TOP_N,
      };
    } else {
      return invalid("Workflow series need a mode: choose workflows or Top-N.");
    }
  }

  // Status filter coherence.
  if (q.filters.statuses && !cap.statusFilterable) {
    return invalid(`A status filter doesn't apply to ${cap.label.toLowerCase()}.`);
  }

  // Compare: KPI or single-series time only, and the measure must support it.
  const compare = q.compare ?? null;
  if (compare) {
    if (!cap.compare) {
      return invalid(`${cap.label} doesn't support period comparison.`);
    }
    const isKpi = q.dimension === null;
    const isSingleSeriesTime = isTime && !q.series;
    if (!isKpi && !isSingleSeriesTime) {
      return invalid(
        "Period comparison is available for a single number or a single-line chart.",
      );
    }
  }

  // Custom range span (presets are validated by construction).
  if ("from" in q.range) {
    const from = Date.parse(q.range.from);
    const to = Date.parse(q.range.to);
    if (!(from < to)) {
      return invalid("The range start must be before its end.");
    }
    if (to - from > ANALYTICS_QUERY_MAX_RANGE_DAYS * DAY_MS) {
      return invalid(
        `The range can cover at most ${ANALYTICS_QUERY_MAX_RANGE_DAYS} days.`,
      );
    }
  }

  return {
    ok: true,
    query: {
      measure: q.measure,
      dimension: q.dimension,
      timeGrain: isTime ? (q.timeGrain ?? "auto") : null,
      series,
      filters: {
        workflowIds: q.filters.workflowIds ?? null,
        statuses: q.filters.statuses ?? null,
        triggerSources: q.filters.triggerSources ?? null,
        includeTests: q.filters.includeTests,
      },
      range: q.range,
      compare,
      sort: isCategorical ? (q.sort ?? { by: "value", dir: "desc" }) : null,
      limit: isCategorical ? (q.limit ?? ANALYTICS_QUERY_DEFAULT_CATEGORY_ROWS) : null,
    },
  };
}

/** Plain-language labels for dimensions (error copy + future UI). */
export function dimensionLabel(d: AnalyticsQueryDimension): string {
  switch (d) {
    case "time":
      return "time";
    case "workflow":
      return "workflows";
    case "status":
      return "status";
    case "trigger_source":
      return "trigger source";
  }
}

/** Plain-language labels for trigger sources (legend/row copy). */
export const TRIGGER_SOURCE_LABELS: Readonly<Record<string, string>> = {
  manual: "Manual",
  test: "Test",
  webhook: "Webhook",
  scheduled: "Scheduled",
  retry: "Retry",
  api_key: "API key",
  unknown: "Unknown",
};

/** Plain-language labels for run statuses. */
export const RUN_STATUS_LABELS: Readonly<Record<string, string>> = {
  succeeded: "Succeeded",
  failed: "Failed",
};
