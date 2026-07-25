import type { AnalyticsRange, InsightWidgetConfig } from "@/contracts/analytics";
import {
  availableDimensionChoices,
  availableFilters,
  availableSeries,
  chartChoices,
  compareAllowed,
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
  /** null = single number; "time" = line (CD-3A's grouping choices). */
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
  range: { preset: AnalyticsRange } | { from: string; to: string };
  compare: boolean;
  chart: "kpi" | "line" | null;
}

export interface InsightReset {
  field:
    | "dataset"
    | "measure"
    | "dimension"
    | "dateField"
    | "timeGrain"
    | "filters"
    | "series"
    | "compare"
    | "chart";
  message: string;
}

export const DEFAULT_INSIGHT_RANGE: { preset: AnalyticsRange } = { preset: "30d" };

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
    chart: config.chart,
  };
}

export function reconcileInsightDraft(
  catalog: InsightCatalog,
  draft: InsightDraft,
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
    if (next.dimension !== null && next.dimension !== "time") next.dimension = null;
    next.series = null;
    next.compare = false;
    next.chart = null;
    return { draft: next, resets };
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
  const charts = chartChoices(dataset, measure, next.dimension);
  if (next.chart !== null && !charts.includes(next.chart)) {
    resets.push({
      field: "chart",
      message: "That chart type doesn't fit the current grouping.",
    });
    next.chart = null;
  }
  if (next.chart === null && charts.length === 1) next.chart = charts[0]!;

  // Compare.
  if (next.compare && !compareAllowed(dataset, measure, next.dimension, next.series !== null)) {
    next.compare = false;
    resets.push({
      field: "compare",
      message: "Period comparison works on a single number or a single-line chart.",
    });
  }

  return { draft: next, resets };
}
