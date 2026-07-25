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

/** CD-3A renders these chart types; bar/table/donut are CD-3B. */
export const INSIGHT_CHARTS = ["kpi", "line"] as const;
export type InsightChart = (typeof INSIGHT_CHARTS)[number];

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

/**
 * Group-by choices for CD-3A: no grouping (KPI) and — when the measure and
 * dataset support it — over time (line). Categorical groupings return with
 * bar/table charts in CD-3B; they are not offered while no shipped chart
 * could render them.
 */
export function availableDimensionChoices(
  dataset: InsightDataset,
  measure: InsightMeasure,
): readonly { id: string | null; label: string }[] {
  const choices: { id: string | null; label: string }[] = [];
  if (dataset.charts.includes("kpi")) {
    choices.push({ id: null, label: "No grouping — one number" });
  }
  if (supportsTime(dataset, measure)) {
    choices.push({ id: "time", label: "Over time" });
  }
  return choices;
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

/** Chart types renderable for the current grouping, CD-3A subset only. */
export function chartChoices(
  dataset: InsightDataset,
  measure: InsightMeasure,
  dimension: string | null,
): readonly InsightChart[] {
  const out: InsightChart[] = [];
  if (dimension === null && dataset.charts.includes("kpi")) out.push("kpi");
  if (dimension === "time" && supportsTime(dataset, measure)) out.push("line");
  return out;
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
