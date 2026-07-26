import type {
  ConnectedAnalyticsQuery,
  ConnectedAnalyticsResult,
  ConnectedRefine,
} from "@/contracts/connectedAnalytics";
import type { AnalyticsField } from "@/contracts/analyticsCatalog";
import type { RegisteredDataset } from "./registry";

/**
 * Attach server-issued drill refinements to a validated result
 * (Slice ANALYTICS-CONNECTED-DATA-CD-5B). PURE — no I/O.
 *
 * Runs in ONE generic place, on the way out of `runConnectedAnalyticsQuery`,
 * AFTER the snapshot cache: cached snapshots never store refinement metadata,
 * and every provider (and every future provider, and the test fixtures) gets
 * identical behavior with zero provider-name branches and zero adapter edits.
 *
 * A row or series earns a refinement only when the catalog proves its id is a
 * canonical filter value:
 *   - a bounded `category` dimension whose declared `values` list contains the
 *     row id (Shopify/Stripe statuses, ChainReact run status) — canonical by
 *     construction;
 *   - an `entity` dimension that explicitly declares
 *     `resultIdsAreFilterValues` (ChainReact workflows, whose rows are keyed
 *     by the same account-owned id the filter accepts).
 *
 * Everything else — QuickBooks customer surrogates, account-specific currency
 * codes with no declared value list, boolean toggles, synthetic groupings —
 * stays a plain readable value. The label placed on the refinement is the
 * catalog's own declared label where one exists, never trusted row text.
 */

function refineForField(
  field: AnalyticsField | undefined,
  id: string,
  rowLabel: string,
): ConnectedRefine | undefined {
  if (!field || !field.filterable) return undefined;
  if (id.length === 0 || id.length > 120) return undefined;
  if (field.kind === "category") {
    const declared = field.values?.find((v) => v.id === id);
    if (!declared) return undefined;
    return { filterKey: field.id, filterValue: id, label: declared.label };
  }
  if (field.kind === "entity" && field.resultIdsAreFilterValues === true) {
    return { filterKey: field.id, filterValue: id, label: rowLabel.slice(0, 120) };
  }
  return undefined;
}

export function attachInsightRefinements(
  reg: RegisteredDataset,
  query: ConnectedAnalyticsQuery,
  result: ConnectedAnalyticsResult,
): ConnectedAnalyticsResult {
  const fieldById = new Map(reg.dataset.fields.map((f) => [f.id, f]));
  // A refinement whose filter the CURRENT measure declares incompatible would
  // only ever build a query the validator rejects — never offer it.
  const measure = reg.capabilities.measures.find((m) => m.id === query.measure);
  const incompatible = new Set(measure?.incompatibleFilters ?? []);
  const usable = (fieldId: string) =>
    incompatible.has(fieldId) ? undefined : fieldById.get(fieldId);

  let rows = result.rows;
  if (rows && result.dimension && result.dimension !== "time") {
    const field = usable(result.dimension);
    rows = rows.map((r) => {
      const refine = refineForField(field, r.id, r.label);
      return refine ? { ...r, refine } : r;
    });
  }

  let series = result.series;
  if (series && query.series?.by) {
    const field = usable(query.series.by);
    series = series.map((s) => {
      const refine = refineForField(field, s.id, s.label);
      return refine ? { ...s, refine } : s;
    });
  }

  if (rows === result.rows && series === result.series) return result;
  return {
    ...result,
    ...(rows !== undefined ? { rows } : {}),
    ...(series !== undefined ? { series } : {}),
  };
}
