import {
  ConnectedAnalyticsError,
  type ConnectedAnalyticsQuery,
} from "@/contracts/connectedAnalytics";
import type { ResolvedMeasure } from "@/contracts/analyticsCatalogDerive";
import type { RegisteredDataset } from "./registry";

/**
 * Canonical connected-query capability validation (CD-1, audit §5).
 *
 * ONE authoritative check of a schema-parsed query against a dataset's
 * derived capabilities. Rejections are typed `INVALID_QUERY` with
 * customer-safe copy — never a silent rewrite into a different valid query.
 * The client projection carries the same capability data so CD-3 can grey
 * out invalid choices, but THIS is the enforcement.
 */

export interface ValidatedConnectedQuery {
  query: ConnectedAnalyticsQuery;
  measure: ResolvedMeasure;
  /** Resolved date field id for time queries (default: first historical). */
  dateField: string | null;
}

const DAY_MS = 86_400_000;

function invalid(message: string): never {
  throw new ConnectedAnalyticsError(message, "INVALID_QUERY");
}

export function validateConnectedQuery(
  reg: RegisteredDataset,
  q: ConnectedAnalyticsQuery,
): ValidatedConnectedQuery {
  const { dataset, capabilities } = reg;

  const measure = capabilities.measures.find((m) => m.id === q.measure);
  if (!measure) invalid("That measure isn't available for this data.");

  // Dimension.
  const isTime = q.dimension === "time";
  if (q.dimension !== null) {
    const dim = capabilities.dimensions.find((d) => d.id === q.dimension);
    if (!dim) invalid("That grouping isn't available for this data.");
    if (measure.dimensions && !measure.dimensions.includes(q.dimension)) {
      invalid(`${measure.label} can't be grouped that way.`);
    }
  }

  // Time-only knobs.
  if (!isTime && q.timeGrain !== undefined) {
    invalid("Time grouping only applies when showing results over time.");
  }
  if (!isTime && q.series !== undefined) {
    invalid("Series only apply when showing results over time.");
  }
  if (!isTime && q.dateField !== undefined && q.dimension !== null) {
    invalid("A date field only applies to time charts.");
  }
  const isCategorical = q.dimension !== null && !isTime;
  if (!isCategorical && q.sort !== undefined) {
    invalid("Sorting only applies to a category breakdown.");
  }
  if (!isCategorical && q.limit !== undefined) {
    invalid("Row limits only apply to a category breakdown.");
  }
  if (q.limit !== undefined && q.limit > dataset.queryLimits.maxCategoryRows) {
    invalid(`At most ${dataset.queryLimits.maxCategoryRows} rows per chart.`);
  }

  // Date field.
  let dateField: string | null = null;
  if (isTime) {
    const candidates = dataset.dateFields.filter((d) => d.historical);
    const chosen = q.dateField
      ? candidates.find((d) => d.id === q.dateField)
      : candidates[0];
    if (!chosen) invalid("That date field can't drive a time chart.");
    dateField = chosen.id;
  }

  // Series.
  if (q.series) {
    const cap = dataset.series.find((s) => s.by === q.series!.by);
    if (!cap) invalid("This data can't be split into those series.");
    if (measure.dimensions && !measure.dimensions.includes(q.series.by)) {
      invalid(`${measure.label} can't be split into those series.`);
    }
    if (q.series.mode === undefined) {
      if (cap.modes.length > 0) invalid("Choose how to pick the series.");
      if (q.series.ids !== undefined || q.series.topN !== undefined) {
        invalid("This series type picks its groups automatically.");
      }
    } else {
      if (!cap.modes.includes(q.series.mode)) {
        invalid("That series selection mode isn't available here.");
      }
      if (q.series.mode === "explicit") {
        if (!q.series.ids?.length) invalid("Choose at least one item for the series.");
        if (q.series.ids.length > cap.max) {
          invalid(`Up to ${cap.max} series per chart.`);
        }
        if (q.series.topN !== undefined) invalid("Top-N doesn't apply to an explicit selection.");
      } else {
        if (q.series.ids !== undefined) invalid("Explicit ids don't apply in Top-N mode.");
        if ((q.series.topN ?? 5) > cap.max) invalid(`Up to ${cap.max} series per chart.`);
      }
    }
  }

  // Filters.
  if (q.filters) {
    for (const [key, value] of Object.entries(q.filters)) {
      const def = capabilities.filters.find((f) => f.id === key);
      if (!def) invalid("One of the filters isn't available for this data.");
      if (measure.incompatibleFilters.includes(key)) {
        invalid(`A ${def.label.toLowerCase()} filter doesn't apply to ${measure.label.toLowerCase()}.`);
      }
      if (def.valueType === "boolean") {
        if (typeof value !== "boolean") invalid(`${def.label} must be on or off.`);
      } else {
        if (!Array.isArray(value)) invalid(`${def.label} needs a list of selections.`);
        if (value.length > def.maxSelections) {
          invalid(`Up to ${def.maxSelections} ${def.label.toLowerCase()} selections.`);
        }
      }
    }
  }

  // Chart intent.
  if (q.chart) {
    if (!dataset.supportedCharts.includes(q.chart)) {
      invalid("That chart type isn't available for this data.");
    }
    if (q.chart === "donut") {
      const dim = q.dimension;
      if (dim === null || !dataset.partToWholeDimensions.includes(dim)) {
        invalid("A donut needs a true part-to-whole breakdown.");
      }
    }
    if (q.chart === "line" && !isTime) invalid("A line chart needs the time grouping.");
    if (q.chart === "kpi" && q.dimension !== null) invalid("A KPI shows one number — remove the grouping.");
  }

  // Compare.
  if (q.compare) {
    if (!measure.compare) invalid(`${measure.label} doesn't support period comparison.`);
    const singleSeriesTime = isTime && !q.series;
    if (!(q.dimension === null || singleSeriesTime)) {
      invalid("Period comparison works on a single number or single-line chart.");
    }
  }

  // Range span.
  if ("from" in q.range) {
    const from = Date.parse(q.range.from);
    const to = Date.parse(q.range.to);
    if (Number.isNaN(from) || Number.isNaN(to) || from >= to) {
      invalid("The range start must be before its end.");
    }
    if (to - from > dataset.queryLimits.maxRangeDays * DAY_MS) {
      invalid(`The range can cover at most ${dataset.queryLimits.maxRangeDays} days.`);
    }
  }

  return { query: q, measure, dateField };
}
