import type { InsightRange, InsightWidgetConfig } from "@/contracts/analytics";
import {
  isGrainAvailable,
  presetsWithinLimit,
  rangeSpanDays,
  validateCustomRange,
  type InsightRangePreset,
} from "@/core/analytics/insightRange";
import {
  availableDimensionChoices,
  sortAllowed,
  type InsightChart,
  availableFilters,
  availableSeries,
  chartChoices,
  compareAllowed,
  defaultChartFor,
  findDataset,
  findMeasure,
  findSource,
  type InsightCatalog,
} from "./insightCatalog";

/**
 * Deterministic selection-dependency reconciliation (CD-3A).
 *
 * PURE: the builder applies a user edit to the draft, then runs
 * `reconcileInsightDraft` — which prunes ONLY the smallest portion made
 * invalid by the change, preserves everything still valid, and reports each
 * pruned field with a human explanation (shown near the affected control).
 * It never substitutes a different business question: an invalid value is
 * cleared and surfaced, never silently rewritten. Server validation stays
 * authoritative for anything crafted or stale.
 */

/** In-progress builder state. Null/empty = not chosen yet. */
export interface InsightDraft {
  source: string | null;
  dataset: string | null;
  measure: string | null;
  /** null = single number · "time" = time buckets · else a category id. */
  dimension: string | null;
  dateField?: string;
  timeGrain: "auto" | "day" | "week" | "month";
  filters: Record<string, string[] | boolean>;
  series: {
    by: string;
    mode?: "top" | "explicit";
    ids?: string[];
    topN?: number;
  } | null;
  /**
   * A preset, or a custom range whose `to` is the user's INCLUSIVE end date
   * (translated to the engine's exclusive boundary in `insightQueryFromConfig`).
   */
  range: InsightRange;
  compare: boolean;
  /** Category-breakdown ordering (CD-3B); null = the server's default order. */
  sort: { by: "value" | "label"; dir: "asc" | "desc" } | null;
  chart: InsightChart | null;
}

export interface InsightReset {
  field:
    | "dataset"
    | "measure"
    | "dimension"
    | "dateField"
    | "timeGrain"
    | "range"
    | "filters"
    | "series"
    | "compare"
    | "sort"
    | "chart";
  message: string;
}

export const DEFAULT_INSIGHT_RANGE: { preset: InsightRangePreset } = { preset: "30d" };

export function emptyInsightDraft(): InsightDraft {
  return {
    source: null,
    dataset: null,
    measure: null,
    dimension: null,
    timeGrain: "auto",
    filters: {},
    series: null,
    range: DEFAULT_INSIGHT_RANGE,
    compare: false,
    sort: null,
    chart: null,
  };
}

/** Rehydrate a saved config into a draft (for the edit flow). */
export function insightDraftFromConfig(config: InsightWidgetConfig): InsightDraft {
  return {
    source: config.source,
    dataset: config.dataset,
    measure: config.measure,
    dimension: config.dimension,
    ...(config.dateField !== undefined ? { dateField: config.dateField } : {}),
    timeGrain: config.timeGrain ?? "auto",
    filters: config.filters
      ? Object.fromEntries(
          Object.entries(config.filters).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v]),
        )
      : {},
    series: config.series
      ? {
          by: config.series.by,
          ...(config.series.mode !== undefined ? { mode: config.series.mode } : {}),
          ...(config.series.ids !== undefined ? { ids: [...config.series.ids] } : {}),
          ...(config.series.topN !== undefined ? { topN: config.series.topN } : {}),
        }
      : null,
    range: config.range ?? DEFAULT_INSIGHT_RANGE,
    compare: config.compare === "previous_period",
    sort: config.sort ? { ...config.sort } : null,
    chart: config.chart,
  };
}

export function reconcileInsightDraft(
  catalog: InsightCatalog,
  draft: InsightDraft,
  /** Injected clock — range/grain compatibility depends on when "last 30 days" is. */
  nowMs: number = Date.now(),
): { draft: InsightDraft; resets: InsightReset[] } {
  const resets: InsightReset[] = [];
  const next: InsightDraft = {
    ...draft,
    filters: { ...draft.filters },
    series: draft.series ? { ...draft.series } : null,
  };

  const source = findSource(catalog, next.source);
  if (!source) {
    // Unknown/no source: everything downstream is meaningless. Only note the
    // clears that actually discard a choice.
    if (next.source !== null) {
      resets.push({
        field: "dataset",
        message: "That app isn't available anymore, so this insight needs new choices.",
      });
    }
    return {
      draft: {
        ...emptyInsightDraft(),
        range: next.range,
      },
      resets,
    };
  }

  let dataset = findDataset(source, next.dataset);
  if (next.dataset !== null && !dataset) {
    resets.push({
      field: "dataset",
      message: `${source.label} doesn't offer that data anymore.`,
    });
    next.dataset = null;
    dataset = null;
  }
  if (!dataset) {
    // Nothing below a dataset can be judged; clear stale downstream choices
    // quietly only if they exist from an obsolete config.
    next.measure = null;
    next.dimension = null;
    delete next.dateField;
    next.timeGrain = "auto";
    next.filters = {};
    next.series = null;
    next.compare = false;
    next.chart = null;
    return { draft: next, resets };
  }

  let measure = findMeasure(dataset, next.measure);
  if (next.measure !== null && !measure) {
    resets.push({
      field: "measure",
      message: `${dataset.label} doesn't include that measure — choose what to show again.`,
    });
    next.measure = null;
    measure = null;
  }

  // Filters are dataset+measure-scoped: keep every still-valid selection.
  const filterDefs = measure ? availableFilters(dataset, measure) : dataset.filters;
  for (const [key, value] of Object.entries(next.filters)) {
    const def = filterDefs.find((f) => f.id === key);
    if (!def) {
      resets.push({
        field: "filters",
        message: `The "${key.replace(/_/g, " ")}" filter doesn't apply here anymore, so it was removed.`,
      });
      delete next.filters[key];
      continue;
    }
    if (def.valueType === "boolean") {
      if (typeof value !== "boolean") {
        delete next.filters[key];
        resets.push({
          field: "filters",
          message: `The ${def.label.toLowerCase()} filter was reset.`,
        });
      }
      continue;
    }
    if (!Array.isArray(value) || value.length === 0) {
      delete next.filters[key];
      continue;
    }
    if (value.length > def.maxSelections) {
      next.filters[key] = value.slice(0, def.maxSelections);
      resets.push({
        field: "filters",
        message: `${def.label} keeps the first ${def.maxSelections} selection${def.maxSelections === 1 ? "" : "s"} — that's the most this filter supports.`,
      });
    }
    // Declared-value filters: drop values the catalog no longer declares.
    if (def.values) {
      const known = new Set(def.values.map((v) => v.id));
      const kept = (next.filters[key] as string[]).filter((v) => known.has(v));
      if (kept.length !== (next.filters[key] as string[]).length) {
        resets.push({
          field: "filters",
          message: `Some ${def.label.toLowerCase()} choices aren't available anymore and were removed.`,
        });
        if (kept.length === 0) delete next.filters[key];
        else next.filters[key] = kept;
      }
    }
  }

  if (!measure) {
    // Without a measure the grouping/series/chart can't be judged — keep the
    // user's grouping only if the dataset could ever support it.
    if (
      next.dimension !== null &&
      next.dimension !== "time" &&
      !dataset.dimensions.some((d) => d.id === next.dimension)
    ) {
      next.dimension = null;
    }
    next.series = null;
    next.compare = false;
    next.sort = null;
    next.chart = null;
    return { draft: next, resets };
  }

  // Range — the new dataset may not accept the range the old one did (CD-5A).
  // Reconciled BEFORE the time knobs, because grain validity depends on span.
  const maxRangeDays = dataset.limits.maxRangeDays;
  if ("preset" in next.range) {
    const presetId = next.range.preset;
    if (!presetsWithinLimit(maxRangeDays).some((p) => p.id === presetId)) {
      next.range = { ...DEFAULT_INSIGHT_RANGE };
      resets.push({
        field: "range",
        message: `This data can cover at most ${maxRangeDays} days at a time — the date range was reset.`,
      });
    }
  } else if (validateCustomRange(next.range.from, next.range.to, maxRangeDays) !== null) {
    next.range = { ...DEFAULT_INSIGHT_RANGE };
    resets.push({
      field: "range",
      message: `This data can cover at most ${maxRangeDays} days at a time — the date range was reset.`,
    });
  }

  // Grouping.
  const dimChoices = availableDimensionChoices(dataset, measure);
  if (!dimChoices.some((c) => c.id === next.dimension)) {
    resets.push({
      field: "dimension",
      message: `${measure.label} can't be grouped that way — the grouping was cleared.`,
    });
    next.dimension = dimChoices[0]?.id ?? null;
  }
  const isTime = next.dimension === "time";

  // Time-only knobs.
  if (!isTime) {
    if (next.timeGrain !== "auto") {
      next.timeGrain = "auto";
      resets.push({
        field: "timeGrain",
        message: "Time grouping only applies to a chart over time.",
      });
    }
    if (next.dateField !== undefined) delete next.dateField;
    if (next.series !== null) {
      next.series = null;
      resets.push({
        field: "series",
        message: "Separate lines only apply to a chart over time.",
      });
    }
  } else {
    // An explicit grain coarser than the range collapses the chart into one
    // meaningless bucket — fall back to Automatic and say so (CD-5A).
    const spanDays = rangeSpanDays(next.range, nowMs);
    if (
      next.timeGrain !== "auto" &&
      spanDays !== null &&
      !isGrainAvailable(next.timeGrain, spanDays)
    ) {
      next.timeGrain = "auto";
      resets.push({
        field: "timeGrain",
        message:
          "That grouping is longer than the dates you picked — using automatic grouping instead.",
      });
    }
    if (
      next.dateField !== undefined &&
      !dataset.dateFields.some((d) => d.id === next.dateField)
    ) {
      delete next.dateField;
      resets.push({
        field: "dateField",
        message: "That date field isn't available — using the default.",
      });
    }
    if (next.series) {
      const caps = availableSeries(dataset, measure);
      const cap = caps.find((c) => c.by === next.series!.by);
      if (!cap) {
        next.series = null;
        resets.push({
          field: "series",
          message: `${measure.label} can't be split into those lines — the series was cleared.`,
        });
      } else {
        const s = next.series;
        if (cap.modes.length === 0) {
          // Automatic capability: no mode/ids/topN.
          if (s.mode !== undefined || s.ids !== undefined || s.topN !== undefined) {
            next.series = { by: s.by };
          }
        } else {
          if (s.mode !== undefined && !cap.modes.includes(s.mode)) {
            const fallback = cap.modes[0]!;
            next.series = { by: s.by, mode: fallback };
            resets.push({
              field: "series",
              message: "That way of picking lines isn't available here — choose again.",
            });
          } else if (s.mode === "explicit") {
            if (s.topN !== undefined) delete s.topN;
            if (s.ids && s.ids.length > cap.max) {
              s.ids = s.ids.slice(0, cap.max);
              resets.push({
                field: "series",
                message: `Up to ${cap.max} lines per chart — extra selections were removed.`,
              });
            }
          } else if (s.mode === "top") {
            if (s.ids !== undefined) delete s.ids;
            if (s.topN !== undefined && s.topN > cap.max) {
              s.topN = cap.max;
              resets.push({
                field: "series",
                message: `Up to ${cap.max} lines per chart.`,
              });
            }
          }
        }
      }
    }
  }

  // Chart: keep if still renderable; otherwise auto-fill only when exactly one
  // honest choice remains (not a substitution — the grouping decides it).
  // Donut carries an extra reason so a user who picked it learns WHY it went.
  const charts = chartChoices(dataset, measure, next.dimension);
  if (next.chart !== null && !charts.includes(next.chart)) {
    resets.push({
      field: "chart",
      message:
        next.chart === "donut"
          ? "A donut needs a breakdown whose parts add up to a meaningful whole, so the chart type was cleared."
          : "That chart type doesn't fit the current grouping.",
    });
    next.chart = null;
  }
  // Fill a natural display for the current shape (kpi / line / bar). The
  // grouping is the question; the chart is how it's drawn, so defaulting it
  // is guidance, never a silent substitution — and any clear above already
  // rendered its explanation.
  if (next.chart === null) next.chart = defaultChartFor(dataset, measure, next.dimension);

  // Ordering applies to a category breakdown only (mirror of the server).
  if (next.sort && !sortAllowed(next.dimension)) {
    next.sort = null;
    resets.push({
      field: "sort",
      message: "Ordering only applies to a category breakdown.",
    });
  }
  // A donut draws a whole; re-ordering its slices is not a business question.
  if (next.sort && next.chart === "donut") next.sort = null;

  // Compare. The donut case is checked FIRST: a donut always carries a
  // categorical dimension, so the general rule below would also reject it — but
  // with copy that explains the wrong thing. Telling someone who just picked a
  // donut about "single-line charts" does not tell them what happened (CD-5A).
  if (next.compare && next.chart === "donut") {
    // A donut shows one period's parts against their own whole; two periods in
    // one ring would misstate every share. Grouping and filters are untouched.
    next.compare = false;
    resets.push({
      field: "compare",
      message: "A donut shows a single period — the previous-period comparison was turned off.",
    });
  } else if (
    next.compare &&
    !compareAllowed(dataset, measure, next.dimension, next.series !== null)
  ) {
    next.compare = false;
    resets.push({
      field: "compare",
      message: "Period comparison works on a single number or a single-line chart.",
    });
  }

  return { draft: next, resets };
}
