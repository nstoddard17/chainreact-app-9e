import type {
  AnalyticsAggregation,
  AnalyticsDataset,
  AnalyticsValueUnit,
} from "./analyticsCatalog";

/**
 * PURE catalog derivation (ANALYTICS-CONNECTED-DATA-CD-1, model D1).
 *
 * Mechanically derives the safe standard measure/dimension/filter menu from a
 * dataset's curated field declarations. Because derivation only reads the
 * typed declarations, meaningless analytics are impossible here by
 * construction: only `measurable` number fields yield sum/avg (ids/enums/text
 * can't), only bounded category/entity/boolean fields yield dimensions (free
 * text can't), and only `historical` date fields yield the time dimension.
 * Named provider measures are merged after a collision check (registry
 * validation rejects id clashes).
 */

export interface ResolvedMeasure {
  id: string;
  label: string;
  unit: AnalyticsValueUnit;
  currencyBehavior?: "single" | "per_record";
  emptyValue: "zero" | "null";
  /** null = every dataset dimension is valid. */
  dimensions: readonly string[] | null;
  incompatibleFilters: readonly string[];
  compare: boolean;
  /** "derived" (mechanical) vs "named" (provider-declared, adapter-computed). */
  origin: "derived" | "named";
  /** For derived field measures: the aggregation + source field id. */
  aggregation?: AnalyticsAggregation | "count" | "distinct_count";
  fieldId?: string;
}

export interface ResolvedDimension {
  id: string;
  label: string;
  kind: "time" | "category" | "entity" | "boolean";
  optionsSource?: string | null;
}

export interface ResolvedFilter {
  id: string;
  label: string;
  valueType: "entity_ids" | "category_values" | "boolean";
  optionsSource?: string | null;
  maxSelections: number;
}

export interface ResolvedDatasetCapabilities {
  measures: readonly ResolvedMeasure[];
  dimensions: readonly ResolvedDimension[];
  filters: readonly ResolvedFilter[];
}

const AGG_LABEL: Record<AnalyticsAggregation, string> = {
  sum: "Total",
  avg: "Average",
  min: "Minimum",
  max: "Maximum",
};

const MAX_FILTER_SELECTIONS = 20;

/** Derive the full capability menu for one dataset. Pure and deterministic. */
export function deriveDatasetCapabilities(
  dataset: AnalyticsDataset,
): ResolvedDatasetCapabilities {
  const measures: ResolvedMeasure[] = [];
  const dimensions: ResolvedDimension[] = [];
  const filters: ResolvedFilter[] = [];

  if (dataset.deriveCount) {
    measures.push({
      id: "count",
      label: `${capitalize(dataset.recordNoun)}`,
      unit: "count",
      emptyValue: "zero",
      dimensions: null,
      incompatibleFilters: [],
      compare: dataset.compare,
      origin: "derived",
      aggregation: "count",
    });
  }

  // Time dimension exists iff any historical date field exists.
  if (dataset.dateFields.some((d) => d.historical)) {
    dimensions.push({ id: "time", label: "Time", kind: "time" });
  }

  for (const f of dataset.fields) {
    if (f.measurable && f.aggregations) {
      for (const agg of f.aggregations) {
        measures.push({
          id: `${agg}_${f.id}`,
          label: `${AGG_LABEL[agg]} ${f.label.toLowerCase()}`,
          unit: f.unit ?? "decimal",
          currencyBehavior: f.currencyBehavior,
          // Sums of facts are 0 when nothing matched; averages/extrema are null.
          emptyValue: agg === "sum" ? "zero" : "null",
          dimensions: null,
          incompatibleFilters: [],
          compare: dataset.compare,
          origin: "derived",
          aggregation: agg,
          fieldId: f.id,
        });
      }
    }
    if (f.distinctCountable) {
      measures.push({
        id: `distinct_${f.id}`,
        label: `Distinct ${f.label.toLowerCase()}`,
        unit: "count",
        emptyValue: "zero",
        dimensions: null,
        incompatibleFilters: [],
        compare: dataset.compare,
        origin: "derived",
        aggregation: "distinct_count",
        fieldId: f.id,
      });
    }
    if (f.dimensionable) {
      dimensions.push({
        id: f.id,
        label: f.label,
        kind: f.kind === "entity" ? "entity" : f.kind === "boolean" ? "boolean" : "category",
        optionsSource: f.kind === "entity" ? (f.optionsSource ?? null) : undefined,
      });
    }
    if (f.filterable) {
      filters.push({
        id: f.id,
        label: f.label,
        valueType:
          f.kind === "entity" ? "entity_ids" : f.kind === "boolean" ? "boolean" : "category_values",
        optionsSource: f.kind === "entity" ? (f.optionsSource ?? null) : undefined,
        maxSelections: f.kind === "boolean" ? 1 : MAX_FILTER_SELECTIONS,
      });
    }
  }

  for (const m of dataset.namedMeasures) {
    measures.push({
      id: m.id,
      label: m.label,
      unit: m.unit,
      currencyBehavior: m.currencyBehavior,
      emptyValue: m.emptyValue,
      dimensions: m.dimensions ?? null,
      incompatibleFilters: m.incompatibleFilters ?? [],
      compare: m.compare && dataset.compare,
      origin: "named",
    });
  }

  return { measures, dimensions, filters };
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}
