import {
  ConnectedAnalyticsError,
  type ConnectedAnalyticsQuery,
  type ConnectedAnalyticsResult,
} from "@/contracts/connectedAnalytics";
import type { ShopifyOrderFact } from "@/services/analytics/sources/shopify/insightOrders";
import {
  bucketStartsFor,
  resolveQueryRange,
  resolveTimeGrain,
  toBuckets,
} from "../../insightQueryTime";
import {
  CANCELLATION_LABELS,
  FINANCIAL_STATUS_LABELS,
  FINANCIAL_STATUS_ORDER,
  FULFILLMENT_STATUS_LABELS,
  FULFILLMENT_STATUS_ORDER,
  MISSING_CURRENCY_WARNING,
  SHOPIFY_ORDER_MEASURES,
  applyFilters,
  cancellationOf,
  emptyAgg,
  measureValue,
  normalizeFinancialStatus,
  normalizeFulfillmentStatus,
  resolveCurrency,
  resolveCurrencyConsistent,
  type Agg,
} from "./measures";

/**
 * PURE Shopify Orders aggregation (CD-4C). No HTTP, no Date.now() — the
 * adapter injects facts + clock, so every rule is unit-tested directly without
 * provider mocking. This module owns SHAPING only (KPI / time series /
 * categorical); measure semantics, status normalization, the test-order
 * default and money live in `measures.ts`.
 */

export {
  MIXED_CURRENCY_MESSAGE,
  MISSING_CURRENCY_WARNING,
  SHOPIFY_ORDER_MEASURES,
  normalizeFinancialStatus,
  normalizeFulfillmentStatus,
} from "./measures";

export interface ShopifyAggregateInput {
  query: ConnectedAnalyticsQuery;
  facts: readonly ShopifyOrderFact[];
  /** Facts for the previous equal window (only when compare requested). */
  prevFacts?: readonly ShopifyOrderFact[];
  truncated: boolean;
  prevTruncated?: boolean;
  /** Orders whose total_price could not be read (money measures warn). */
  malformedAmounts?: number;
  now: number;
  scanCap: number;
}

export function aggregateShopifyOrders(
  input: ShopifyAggregateInput,
): ConnectedAnalyticsResult {
  const { query, now } = input;
  const measure = SHOPIFY_ORDER_MEASURES[query.measure];
  if (!measure) {
    throw new ConnectedAnalyticsError(
      "That measure isn't available for this data.",
      "INVALID_QUERY",
    );
  }

  const { fromMs, toMs } = resolveQueryRange(query.range, now);
  const within = (f: ShopifyOrderFact, aMs: number, bMs: number): boolean =>
    f.createdMs !== null && f.createdMs >= aMs && f.createdMs < bMs; // [from, to)
  const filtered = applyFilters(input.facts, query).filter((f) => within(f, fromMs, toMs));
  const eligible = filtered.filter(measure.eligible);
  const currency = measure.monetary ? resolveCurrency(eligible) : null;

  const truncated = input.truncated || (input.prevTruncated ?? false);
  const completeness: ConnectedAnalyticsResult["completeness"] = truncated
    ? {
        state: "scan_capped",
        detail: `Based on the ${input.scanCap} most recently placed orders — there were more in this range.`,
      }
    : { state: "complete" };
  const warnings: string[] = [];
  if (truncated) {
    warnings.push(
      `Shopify returned more orders than this chart can scan at once. The result reflects the ${input.scanCap} most recently placed matching orders and may be incomplete.`,
    );
  }
  if (measure.monetary && currency === null && eligible.length > 0) {
    warnings.push(MISSING_CURRENCY_WARNING);
  }
  if (measure.monetary && (input.malformedAmounts ?? 0) > 0) {
    const n = input.malformedAmounts!;
    warnings.push(
      `${n} order${n === 1 ? "" : "s"} had an unreadable total and ${n === 1 ? "was" : "were"} left out of this amount.`,
    );
  }

  const base = {
    source: {
      sourceId: "shopify",
      sourceLabel: "Shopify",
      datasetId: "orders",
      datasetLabel: "Orders",
    },
    measure: { id: query.measure, label: measure.label },
    range: { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() },
    valueMeta: {
      unit: measure.monetary ? ("currency" as const) : ("count" as const),
      ...(measure.monetary && currency ? { currency: currency.toUpperCase() } : {}),
    },
    freshness: { mode: "cached" as const, ageSeconds: 0, ttlSeconds: 600 },
    completeness,
    warnings,
  };

  const accumulate = (agg: Agg, f: ShopifyOrderFact): void => {
    agg.count += 1;
    if (measure.amountOf) agg.minorSum += measure.amountOf(f);
  };
  const prevEligible = (): readonly ShopifyOrderFact[] => {
    const prevFrom = fromMs - (toMs - fromMs);
    return applyFilters(input.prevFacts ?? [], query)
      .filter((f) => within(f, prevFrom, fromMs))
      .filter(measure.eligible);
  };

  // ── KPI ────────────────────────────────────────────────────────────────────
  if (query.dimension === null) {
    const agg = emptyAgg();
    for (const f of eligible) accumulate(agg, f);

    let compare: ConnectedAnalyticsResult["compare"] = null;
    if (query.compare === "previous_period") {
      const prev = prevEligible();
      const prevCurrency = measure.monetary
        ? resolveCurrencyConsistent(prev, currency)
        : null;
      const prevAgg = emptyAgg();
      for (const f of prev) accumulate(prevAgg, f);
      compare = {
        previousValue: measureValue(query.measure, prevAgg, prevCurrency ?? currency),
        previousRange: {
          from: new Date(fromMs - (toMs - fromMs)).toISOString(),
          to: new Date(fromMs).toISOString(),
        },
      };
    }
    return {
      ...base,
      kind: "kpi",
      dimension: null,
      grain: null,
      value: measureValue(query.measure, agg, currency),
      compare,
    };
  }

  // ── Time series ────────────────────────────────────────────────────────────
  if (query.dimension === "time") {
    const grain = resolveTimeGrain(query.timeGrain ?? "auto", toMs - fromMs);
    const starts = bucketStartsFor(grain, fromMs, toMs);
    const idxOf = (ms: number): number => {
      for (let i = starts.length - 1; i >= 0; i--) {
        if (ms >= starts[i]!) return i;
      }
      return -1;
    };

    const seriesBy = query.series?.by ?? null;
    const keyOfFact = (f: ShopifyOrderFact): string =>
      seriesBy === "financial_status"
        ? normalizeFinancialStatus(f.financialStatus)
        : seriesBy === "fulfillment_status"
          ? normalizeFulfillmentStatus(f.fulfillmentStatus)
          : "total";
    const seriesKeys = keysForSeries(seriesBy, query, eligible, keyOfFact);

    const aggs = new Map<string, Agg[]>(
      seriesKeys.map((k) => [k, starts.map(() => emptyAgg())]),
    );
    for (const f of eligible) {
      if (f.createdMs === null) continue;
      const idx = idxOf(f.createdMs);
      if (idx < 0) continue;
      const row = aggs.get(keyOfFact(f));
      if (!row) continue;
      accumulate(row[idx]!, f);
    }

    const series = seriesKeys.map((key) => ({
      id: key,
      label: seriesLabel(key, seriesBy, measure.label),
      values: aggs.get(key)!.map((a) =>
        a.count === 0 && measure.emptyValue !== "zero"
          ? null
          : measureValue(query.measure, a, currency),
      ),
    }));

    let compareSeries: ConnectedAnalyticsResult["compareSeries"] = null;
    if (query.compare === "previous_period" && !query.series) {
      const prevFrom = fromMs - (toMs - fromMs);
      const prev = prevEligible();
      const prevCurrency = measure.monetary
        ? resolveCurrencyConsistent(prev, currency)
        : null;
      const prevStarts = bucketStartsFor(grain, prevFrom, fromMs);
      const prevAggs = prevStarts.map(() => emptyAgg());
      for (const f of prev) {
        if (f.createdMs === null) continue;
        for (let i = prevStarts.length - 1; i >= 0; i--) {
          if (f.createdMs >= prevStarts[i]!) {
            accumulate(prevAggs[i]!, f);
            break;
          }
        }
      }
      const prevValues = prevAggs.map((a) =>
        a.count === 0 && measure.emptyValue !== "zero"
          ? null
          : measureValue(query.measure, a, prevCurrency ?? currency),
      );
      compareSeries = {
        previousRange: {
          from: new Date(prevFrom).toISOString(),
          to: new Date(fromMs).toISOString(),
        },
        values: starts.map((_, i) => prevValues[i] ?? null),
        // Previous window's own boundaries for previous-period drill (CD-5B).
        buckets: toBuckets(prevStarts, grain),
      };
    }

    return {
      ...base,
      kind: "time_series",
      dimension: "time",
      grain,
      buckets: toBuckets(starts, grain),
      series,
      compareSeries,
    };
  }

  // ── Categorical ────────────────────────────────────────────────────────────
  const groups = new Map<string, Agg>();
  for (const f of eligible) {
    const k = categoryKeyOf(f, query.dimension);
    const a = groups.get(k) ?? emptyAgg();
    accumulate(a, f);
    groups.set(k, a);
  }

  let rows = [...groups.entries()].map(([id, a]) => ({
    id,
    label: categoryLabel(id, query.dimension),
    value: measureValue(query.measure, a, currency),
    records: a.count,
  }));
  const sort = query.sort ?? { by: "value" as const, dir: "desc" as const };
  rows.sort((a, b) => {
    const cmp =
      sort.by === "label"
        ? a.label.localeCompare(b.label)
        : (a.value ?? -Infinity) - (b.value ?? -Infinity);
    return sort.dir === "asc" ? cmp : -cmp;
  });
  const limit = query.limit ?? 25;
  const rowCapped = rows.length > limit;
  rows = rows.slice(0, limit);

  return {
    ...base,
    completeness:
      rowCapped && completeness.state === "complete"
        ? { state: "row_capped" }
        : completeness,
    kind: "categorical",
    dimension: query.dimension,
    grain: null,
    rows,
  };
}

/**
 * Series keys: the statuses OBSERVED among the eligible facts, in the domain's
 * canonical display order (never more than the domain's size, so the 8-series
 * bound holds by construction). A status filter narrows the candidates; an
 * unfiltered empty window yields no series rather than eight flat zero lines.
 */
function keysForSeries(
  seriesBy: string | null,
  query: ConnectedAnalyticsQuery,
  eligible: readonly ShopifyOrderFact[],
  keyOfFact: (f: ShopifyOrderFact) => string,
): readonly string[] {
  if (seriesBy !== "financial_status" && seriesBy !== "fulfillment_status") {
    return ["total"];
  }
  const domain =
    seriesBy === "financial_status" ? FINANCIAL_STATUS_ORDER : FULFILLMENT_STATUS_ORDER;
  const filter = query.filters?.[seriesBy];
  const allowed = Array.isArray(filter) ? new Set(filter) : null;
  const observed = new Set(eligible.map(keyOfFact));
  return domain.filter((s) => observed.has(s) && (!allowed || allowed.has(s)));
}

function seriesLabel(key: string, seriesBy: string | null, measureLabel: string): string {
  if (seriesBy === "financial_status") return FINANCIAL_STATUS_LABELS[key] ?? key;
  if (seriesBy === "fulfillment_status") return FULFILLMENT_STATUS_LABELS[key] ?? key;
  return measureLabel;
}

function categoryKeyOf(f: ShopifyOrderFact, dimension: string | null): string {
  if (dimension === "financial_status") return normalizeFinancialStatus(f.financialStatus);
  if (dimension === "fulfillment_status") return normalizeFulfillmentStatus(f.fulfillmentStatus);
  if (dimension === "cancellation_state") return cancellationOf(f);
  return f.currency ?? "unknown";
}

function categoryLabel(id: string, dimension: string | null): string {
  if (dimension === "financial_status") return FINANCIAL_STATUS_LABELS[id] ?? id;
  if (dimension === "fulfillment_status") return FULFILLMENT_STATUS_LABELS[id] ?? id;
  if (dimension === "cancellation_state") return CANCELLATION_LABELS[id] ?? id;
  return id === "unknown" ? "Unknown" : id.toUpperCase();
}
