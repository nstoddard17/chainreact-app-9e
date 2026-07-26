import type { ClientAnalyticsCatalog } from "@/services/analytics/insights/clientProjection";

/**
 * Pure catalog selectors for the Custom Insight builder (CD-3A).
 *
 * Every list the builder renders — sources, datasets, measures, groupings,
 * filters, series, time capability, chart choices — is DERIVED from the
 * client-safe catalog projection through these helpers. There are no
 * hand-written per-provider lists and no provider-name branches; the server
 * remains authoritative (services/analytics/insights/validateQuery.ts), these
 * selectors only mirror it so the UI never offers an invalid combination.
 */

export type InsightCatalog = ClientAnalyticsCatalog;
export type InsightSource = InsightCatalog["sources"][number];
export type InsightDataset = InsightSource["datasets"][number];
export type InsightMeasure = InsightDataset["measures"][number];
export type InsightDimension = InsightDataset["dimensions"][number];
export type InsightFilterDef = InsightDataset["filters"][number];
export type InsightSeriesCap = InsightDataset["series"][number];

/** Every display type the Insight renderer can draw (CD-3A kpi/line + CD-3B). */
export const INSIGHT_CHARTS = ["kpi", "line", "bar", "table", "donut"] as const;
export type InsightChart = (typeof INSIGHT_CHARTS)[number];

/** Customer-facing chart names (never the internal ids). */
export const INSIGHT_CHART_LABELS: Record<InsightChart, string> = {
  kpi: "Number",
  line: "Line chart",
  bar: "Bar chart",
  table: "Table",
  donut: "Donut",
};

export function findSource(
  catalog: InsightCatalog,
  id: string | null,
): InsightSource | null {
  if (!id) return null;
  return catalog.sources.find((s) => s.id === id) ?? null;
}

export function findDataset(
  source: InsightSource | null,
  id: string | null,
): InsightDataset | null {
  if (!source || !id) return null;
  return source.datasets.find((d) => d.id === id) ?? null;
}

export function findMeasure(
  dataset: InsightDataset | null,
  id: string | null,
): InsightMeasure | null {
  if (!dataset || !id) return null;
  return dataset.measures.find((m) => m.id === id) ?? null;
}

/** Dimension ids valid for a measure (null list ⇒ all dataset dimensions). */
export function measureDimensionIds(
  dataset: InsightDataset,
  measure: InsightMeasure,
): readonly string[] {
  return measure.dimensions ?? dataset.dimensions.map((d) => d.id);
}

/** Whether the dataset can chart this measure over time (line). */
export function supportsTime(dataset: InsightDataset, measure: InsightMeasure): boolean {
  return (
    dataset.charts.includes("line") &&
    dataset.dateFields.length > 0 &&
    measureDimensionIds(dataset, measure).includes("time")
  );
}

/** Whether a categorical breakdown of this measure can be drawn at all. */
export function supportsCategorical(dataset: InsightDataset): boolean {
  return (
    dataset.charts.includes("bar") ||
    dataset.charts.includes("table") ||
    dataset.charts.includes("donut")
  );
}

/**
 * Group-by choices (CD-3B): no grouping, over time, and every CATEGORICAL
 * dimension the measure declares — the latter became offerable once bar /
 * table / donut shipped. A choice is only listed when some declared chart
 * could actually render it, so the builder never offers a dead end.
 */
export function availableDimensionChoices(
  dataset: InsightDataset,
  measure: InsightMeasure,
): readonly { id: string | null; label: string }[] {
  const choices: { id: string | null; label: string }[] = [];
  if (dataset.charts.includes("kpi") || dataset.charts.includes("table")) {
    choices.push({ id: null, label: "No grouping — one number" });
  }
  if (supportsTime(dataset, measure)) {
    choices.push({ id: "time", label: "Over time" });
  }
  if (supportsCategorical(dataset)) {
    const allowed = measureDimensionIds(dataset, measure);
    for (const dim of dataset.dimensions) {
      if (dim.kind === "time" || !allowed.includes(dim.id)) continue;
      choices.push({ id: dim.id, label: `By ${dim.label.toLowerCase()}` });
    }
  }
  return choices;
}

/** True when the dimension is a declared TRUE part-to-whole (donut gate). */
export function isPartToWhole(dataset: InsightDataset, dimension: string | null): boolean {
  return dimension !== null && dataset.partToWholeDimensions.includes(dimension);
}

/** Filters that apply to this measure (existence minus incompatibilities). */
export function availableFilters(
  dataset: InsightDataset,
  measure: InsightMeasure,
): readonly InsightFilterDef[] {
  return dataset.filters.filter((f) => !measure.incompatibleFilters.includes(f.id));
}

/** Series capabilities compatible with this measure (line charts only). */
export function availableSeries(
  dataset: InsightDataset,
  measure: InsightMeasure,
): readonly InsightSeriesCap[] {
  const dims = measureDimensionIds(dataset, measure);
  return dataset.series.filter((s) => dims.includes(s.by));
}

/** The catalog dimension a series capability splits by (for labels/pickers). */
export function seriesDimension(
  dataset: InsightDataset,
  cap: InsightSeriesCap,
): InsightDimension | null {
  return dataset.dimensions.find((d) => d.id === cap.by) ?? null;
}

/**
 * Chart types renderable for the current grouping (CD-3B).
 *
 * Derived ENTIRELY from the dataset's declared `charts` + the measure's
 * dimension capability + `partToWholeDimensions` — there is no measure-name
 * or provider allow-list anywhere. Shape rules:
 *   - ungrouped  → kpi (one number) · table (a labeled single row)
 *   - over time  → line · bar (discrete buckets) · table
 *   - by category→ bar · table · donut (ONLY on a declared part-to-whole)
 * The server re-validates every one of these (validateQuery.ts).
 */
export function chartChoices(
  dataset: InsightDataset,
  measure: InsightMeasure,
  dimension: string | null,
): readonly InsightChart[] {
  const has = (c: InsightChart) => dataset.charts.includes(c);
  const out: InsightChart[] = [];
  if (dimension === null) {
    if (has("kpi")) out.push("kpi");
    if (has("table")) out.push("table");
    return out;
  }
  if (dimension === "time") {
    if (supportsTime(dataset, measure)) out.push("line");
    if (has("bar")) out.push("bar");
    if (has("table")) out.push("table");
    return out;
  }
  // Categorical grouping — valid only where the measure allows the dimension.
  if (!measureDimensionIds(dataset, measure).includes(dimension)) return out;
  if (has("bar")) out.push("bar");
  if (has("table")) out.push("table");
  if (has("donut") && isPartToWhole(dataset, dimension)) out.push("donut");
  return out;
}

/**
 * The natural display for a shape, used when the previous chart type stopped
 * fitting. Choosing HOW to draw an answer is a display default, not a change
 * to the business question (the grouping decides that) — so the builder keeps
 * CD-3A's guided feel instead of stranding the user on an unset chart.
 */
export function defaultChartFor(
  dataset: InsightDataset,
  measure: InsightMeasure,
  dimension: string | null,
): InsightChart | null {
  const choices = chartChoices(dataset, measure, dimension);
  if (choices.length === 0) return null;
  const preferred: InsightChart =
    dimension === null ? "kpi" : dimension === "time" ? "line" : "bar";
  return choices.includes(preferred) ? preferred : choices[0]!;
}

/** Whether a categorical breakdown can be ordered (bar/table sort control). */
export function sortAllowed(dimension: string | null): boolean {
  return dimension !== null && dimension !== "time";
}

/** Whether period comparison is offerable for this shape (mirror of server). */
export function compareAllowed(
  dataset: InsightDataset,
  measure: InsightMeasure,
  dimension: string | null,
  hasSeries: boolean,
): boolean {
  if (!dataset.compare || !measure.compare) return false;
  if (dimension === null) return true;
  return dimension === "time" && !hasSeries;
}
