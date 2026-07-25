import {
  ConnectedAnalyticsError,
  type ConnectedAnalyticsQuery,
  type ConnectedAnalyticsResult,
} from "@/contracts/connectedAnalytics";
import type { InvoiceFact } from "@/services/analytics/sources/quickbooks/api";
import {
  bucketStartsFor,
  resolveQueryRange,
  resolveTimeGrain,
  toBuckets,
} from "../../insightQueryTime";
import {
  MISSING_CURRENCY_WARNING,
  PAID_STATUS_ORDER,
  QUICKBOOKS_INVOICE_MEASURES,
  QUICKBOOKS_PAID_STATUS_LABELS,
  applyFilters,
  emptyAgg,
  measureValue,
  paidStatusOf,
  resolveCurrency,
  resolveCurrencyConsistent,
  txnDateMs,
  type Agg,
} from "./measures";

/**
 * PURE QuickBooks Invoices aggregation (CD-4B). No HTTP, no Date.now() — the
 * adapter injects facts + clock, so every rule is unit-tested directly without
 * provider mocking. This module owns SHAPING only (KPI / time series /
 * categorical); the measure semantics, money handling and paid-status
 * derivation live in `measures.ts`.
 */

export {
  MIXED_CURRENCY_MESSAGE,
  MISSING_CURRENCY_WARNING,
  QUICKBOOKS_INVOICE_MEASURES,
  QUICKBOOKS_PAID_STATUS_LABELS,
  paidStatusOf,
} from "./measures";

export interface QuickbooksAggregateInput {
  query: ConnectedAnalyticsQuery;
  facts: readonly InvoiceFact[];
  /** Facts for the previous equal window (only when compare requested). */
  prevFacts?: readonly InvoiceFact[];
  truncated: boolean;
  prevTruncated?: boolean;
  /** Invoices the scan dropped as unreadable. */
  malformed?: number;
  now: number;
  scanCap: number;
}

export function aggregateQuickbooksInvoices(
  input: QuickbooksAggregateInput,
): ConnectedAnalyticsResult {
  const { query, now } = input;
  const measure = QUICKBOOKS_INVOICE_MEASURES[query.measure];
  if (!measure) {
    throw new ConnectedAnalyticsError(
      "That measure isn't available for this data.",
      "INVALID_QUERY",
    );
  }
  // Defence in depth: the catalog omits `time` for current-state measures and
  // validateQuery rejects it, but a crafted call must never reach an aggregate
  // that would silently draw a historical balance.
  if (measure.currentState && query.dimension === "time") {
    throw new ConnectedAnalyticsError(
      `${measure.label} is a current-state amount and can't be charted over time.`,
      "INVALID_QUERY",
    );
  }

  const { fromMs, toMs } = resolveQueryRange(query.range, now);
  const within = (f: InvoiceFact, aMs: number, bMs: number): boolean => {
    const ms = txnDateMs(f);
    return ms !== null && ms >= aMs && ms < bMs; // [from, to)
  };
  const filtered = applyFilters(input.facts, query).filter((f) => within(f, fromMs, toMs));
  const eligible = filtered.filter(measure.eligible);
  const currency = measure.monetary ? resolveCurrency(eligible) : null;

  const truncated = input.truncated || (input.prevTruncated ?? false);
  const completeness: ConnectedAnalyticsResult["completeness"] = truncated
    ? {
        state: "scan_capped",
        detail: `Based on the first ${input.scanCap} invoices (most recently created first) — there were more in this range.`,
      }
    : { state: "complete" };
  const warnings: string[] = [];
  if (truncated) {
    warnings.push(
      `QuickBooks returned more invoices than this chart can scan at once. The result reflects the ${input.scanCap} most recently created matching invoices and may be incomplete.`,
    );
  }
  if (measure.monetary && currency === null && eligible.length > 0) {
    warnings.push(MISSING_CURRENCY_WARNING);
  }
  if ((input.malformed ?? 0) > 0) {
    const n = input.malformed!;
    warnings.push(
      `${n} invoice${n === 1 ? "" : "s"} couldn't be read and ${n === 1 ? "was" : "were"} left out.`,
    );
  }

  const base = {
    source: {
      sourceId: "quickbooks",
      sourceLabel: "QuickBooks",
      datasetId: "invoices",
      datasetLabel: "Invoices",
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

  const accumulate = (agg: Agg, f: InvoiceFact): void => {
    agg.count += 1;
    if (measure.amountOf) agg.minorSum += measure.amountOf(f);
  };
  /** The previous equal window's eligible facts (compare only). */
  const prevEligible = (): readonly InvoiceFact[] => {
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

  // ── Time series (historical measures only) ────────────────────────────────
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
    const seriesKeys = keysForSeries(seriesBy, query);
    const keyOfFact = (f: InvoiceFact): string =>
      seriesBy === "paid_status"
        ? paidStatusOf(f)
        : seriesBy === "customer"
          ? (f.customerKey ?? "")
          : "total";

    const aggs = new Map<string, Agg[]>(
      seriesKeys.map((k) => [k, starts.map(() => emptyAgg())]),
    );
    const labels = new Map<string, string>();
    for (const f of eligible) {
      const ms = txnDateMs(f);
      if (ms === null) continue;
      const idx = idxOf(ms);
      if (idx < 0) continue;
      const row = aggs.get(keyOfFact(f));
      if (!row) continue;
      accumulate(row[idx]!, f);
      if (seriesBy === "customer" && f.customerLabel) {
        labels.set(keyOfFact(f), f.customerLabel);
      }
    }

    const series = seriesKeys.map((key) => ({
      id: key,
      label: seriesLabel(key, seriesBy, labels, measure.label),
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
        const ms = txnDateMs(f);
        if (ms === null) continue;
        for (let i = prevStarts.length - 1; i >= 0; i--) {
          if (ms >= prevStarts[i]!) {
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

  // ── Categorical (customer / paid_status / currency) ───────────────────────
  const groups = new Map<string, Agg>();
  const labels = new Map<string, string>();
  for (const f of eligible) {
    const k = categoryKeyOf(f, query.dimension);
    const a = groups.get(k) ?? emptyAgg();
    accumulate(a, f);
    groups.set(k, a);
    if (query.dimension === "customer" && f.customerLabel) labels.set(k, f.customerLabel);
  }

  let rows = [...groups.entries()].map(([id, a]) => ({
    id,
    label: categoryLabel(id, query.dimension, labels),
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

/** Which series keys exist, in a deterministic order. */
function keysForSeries(
  seriesBy: string | null,
  query: ConnectedAnalyticsQuery,
): readonly string[] {
  if (seriesBy === "paid_status") {
    const filter = query.filters?.["paid_status"];
    return PAID_STATUS_ORDER.filter((s) => !Array.isArray(filter) || filter.includes(s));
  }
  if (seriesBy === "customer") {
    // EXPLICIT selection only (the catalog offers no Top-N mode): the user's
    // chosen customers are the series, in the order they picked them, so a
    // customer with no invoices in the window still shows as an empty line
    // instead of silently vanishing. `ids` are opaque customer keys.
    return query.series?.ids ?? [];
  }
  return ["total"];
}

function seriesLabel(
  key: string,
  seriesBy: string | null,
  labels: ReadonlyMap<string, string>,
  measureLabel: string,
): string {
  if (seriesBy === "paid_status") return QUICKBOOKS_PAID_STATUS_LABELS[key] ?? key;
  if (seriesBy === "customer") return labels.get(key) ?? "Unknown customer";
  return measureLabel;
}

function categoryKeyOf(f: InvoiceFact, dimension: string | null): string {
  if (dimension === "paid_status") return paidStatusOf(f);
  if (dimension === "currency") return f.currency ?? "unknown";
  return f.customerKey ?? "unknown";
}

function categoryLabel(
  id: string,
  dimension: string | null,
  labels: ReadonlyMap<string, string>,
): string {
  if (dimension === "paid_status") return QUICKBOOKS_PAID_STATUS_LABELS[id] ?? id;
  if (dimension === "currency") return id === "unknown" ? "Unknown" : id.toUpperCase();
  return labels.get(id) ?? "Unknown customer";
}
