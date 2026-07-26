import {
  ConnectedAnalyticsError,
  type ConnectedAnalyticsQuery,
  type ConnectedAnalyticsResult,
} from "@/contracts/connectedAnalytics";
import type { ChargeFact } from "@/services/analytics/sources/stripe/api";
import { minorToMajor, roundMajor } from "@/services/analytics/sources/stripe/buckets";
import {
  bucketStartsFor,
  resolveQueryRange,
  resolveTimeGrain,
  toBuckets,
} from "../../insightQueryTime";

/**
 * PURE Stripe Payments aggregation (CD-2). No HTTP, no Date.now() — the
 * adapter injects facts + clock; every business rule here is directly
 * unit-tested without provider mocking.
 *
 * MEASURE SEMANTICS (dataset semantics doc — the source of the labels):
 *   - payment_count            = every charge returned in the window
 *   - successful_payment_count = charges with status "succeeded"
 *   - failed_payment_count     = charges with status "failed"
 *   - gross_payment_amount     = Σ original amount of SUCCEEDED charges.
 *     GROSS: refunds are NOT subtracted (partial-refund amounts aren't in the
 *     projection), fees are NOT subtracted; this is charge activity, not
 *     accounting revenue / payouts / cash.
 *   - avg_payment_amount       = gross / succeeded-count over the SAME domain
 *     (never divided by attempted/failed records); null when none.
 *
 * MONEY: integer minor-unit accumulation; ONE conversion to major units at
 * emit via the canonical zero-decimal-aware helper; values are major-unit
 * decimals with `valueMeta.currency` (uppercase ISO). A monetary measure over
 * more than one currency (after filters) throws typed MIXED_CURRENCY — never
 * a silently-dominant currency.
 */

export const STRIPE_STATUS_LABELS: Readonly<Record<string, string>> = {
  succeeded: "Succeeded",
  pending: "Pending",
  failed: "Failed",
};
const STATUS_ORDER = ["succeeded", "pending", "failed"] as const;

export const STRIPE_MEASURES: Readonly<
  Record<
    string,
    {
      label: string;
      monetary: boolean;
      emptyValue: "zero" | "null";
      eligible: (f: ChargeFact) => boolean;
    }
  >
> = {
  payment_count: { label: "Payments", monetary: false, emptyValue: "zero", eligible: () => true },
  successful_payment_count: {
    label: "Successful payments", monetary: false, emptyValue: "zero",
    eligible: (f) => f.status === "succeeded",
  },
  failed_payment_count: {
    label: "Failed payments", monetary: false, emptyValue: "zero",
    eligible: (f) => f.status === "failed",
  },
  gross_payment_amount: {
    label: "Gross payment amount", monetary: true, emptyValue: "zero",
    eligible: (f) => f.status === "succeeded",
  },
  avg_payment_amount: {
    label: "Average payment amount", monetary: true, emptyValue: "null",
    eligible: (f) => f.status === "succeeded",
  },
};

export const MIXED_CURRENCY_MESSAGE =
  "This amount includes more than one currency. Filter to one currency or chart Payment count instead.";

interface Agg {
  count: number;
  minorSum: number;
}
const emptyAgg = (): Agg => ({ count: 0, minorSum: 0 });

function measureValue(
  measureId: string,
  agg: Agg,
  currency: string | null,
): number | null {
  const m = STRIPE_MEASURES[measureId]!;
  if (!m.monetary) return agg.count;
  if (measureId === "gross_payment_amount") {
    return currency ? roundMajor(minorToMajor(agg.minorSum, currency)) : 0;
  }
  // avg_payment_amount
  if (agg.count === 0) return null;
  return currency ? roundMajor(minorToMajor(agg.minorSum, currency) / agg.count) : null;
}

export interface StripeAggregateInput {
  query: ConnectedAnalyticsQuery;
  facts: readonly ChargeFact[];
  /** Facts for the previous equal window (only when compare requested). */
  prevFacts?: readonly ChargeFact[];
  truncated: boolean;
  prevTruncated?: boolean;
  now: number;
  scanCap: number;
}

/** Filter by declared query filters (status/currency; customer is server-side). */
function applyFilters(
  facts: readonly ChargeFact[],
  query: ConnectedAnalyticsQuery,
): readonly ChargeFact[] {
  const statuses = query.filters?.["status"];
  const currencies = query.filters?.["currency"];
  const statusSet = Array.isArray(statuses) ? new Set(statuses) : null;
  const currencySet = Array.isArray(currencies)
    ? new Set(currencies.map((c) => c.toLowerCase()))
    : null;
  return facts.filter(
    (f) =>
      (!statusSet || statusSet.has(f.status)) &&
      (!currencySet || currencySet.has(f.currency.toLowerCase())),
  );
}

/** Single-currency resolution for monetary measures; MIXED_CURRENCY when >1. */
function resolveCurrency(eligible: readonly ChargeFact[]): string | null {
  const currencies = new Set(eligible.map((f) => f.currency.toLowerCase()));
  if (currencies.size > 1) {
    throw new ConnectedAnalyticsError(MIXED_CURRENCY_MESSAGE, "MIXED_CURRENCY");
  }
  return currencies.size === 1 ? [...currencies][0]! : null;
}

export function aggregateStripePayments(
  input: StripeAggregateInput,
): ConnectedAnalyticsResult {
  const { query, now } = input;
  const measure = STRIPE_MEASURES[query.measure];
  if (!measure) {
    throw new ConnectedAnalyticsError("That measure isn't available for this data.", "INVALID_QUERY");
  }
  const { fromMs, toMs } = resolveQueryRange(query.range, now);
  const filtered = applyFilters(input.facts, query).filter((f) => {
    const t = f.created * 1000;
    return t >= fromMs && t < toMs; // [from, to) — defense on top of the scan
  });
  const eligible = filtered.filter(measure.eligible);
  const currency = measure.monetary ? resolveCurrency(eligible) : null;

  const truncated = input.truncated || (input.prevTruncated ?? false);
  const completeness: ConnectedAnalyticsResult["completeness"] = truncated
    ? {
        state: "scan_capped",
        detail: `Based on the first ${input.scanCap} matching payments (newest first) — there were more in this range.`,
      }
    : { state: "complete" };
  const warnings = truncated
    ? [
        `Stripe returned more payments than this chart can scan at once. The result reflects the ${input.scanCap} most recent matching payments and may be incomplete.`,
      ]
    : [];

  const base = {
    source: {
      sourceId: "stripe",
      sourceLabel: "Stripe",
      datasetId: "payments",
      datasetLabel: "Payments",
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

  // ── KPI ────────────────────────────────────────────────────────────────────
  if (query.dimension === null) {
    const agg = eligible.reduce(
      (a, f) => ({ count: a.count + 1, minorSum: a.minorSum + f.amount }),
      emptyAgg(),
    );
    let compare: ConnectedAnalyticsResult["compare"] = null;
    if (query.compare === "previous_period") {
      const prev = applyFilters(input.prevFacts ?? [], query).filter(measure.eligible);
      const prevCurrency = measure.monetary
        ? resolveCurrencyConsistent(prev, currency)
        : null;
      const prevAgg = prev.reduce(
        (a, f) => ({ count: a.count + 1, minorSum: a.minorSum + f.amount }),
        emptyAgg(),
      );
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
    const idxOf = (ms: number) => {
      // Buckets are sorted; linear scan is fine at ≤400.
      for (let i = starts.length - 1; i >= 0; i--) {
        if (ms >= starts[i]!) return i;
      }
      return -1;
    };
    const seriesKeys: readonly string[] =
      query.series?.by === "status"
        ? STATUS_ORDER.filter((s) => {
            const f = query.filters?.["status"];
            return !Array.isArray(f) || f.includes(s);
          })
        : ["total"];
    const aggs = new Map<string, Agg[]>(
      seriesKeys.map((k) => [k, starts.map(() => emptyAgg())]),
    );
    for (const f of eligible) {
      const idx = idxOf(f.created * 1000);
      if (idx < 0) continue;
      const key = query.series?.by === "status" ? f.status : "total";
      const row = aggs.get(key);
      if (!row) continue;
      row[idx]!.count += 1;
      row[idx]!.minorSum += f.amount;
    }
    const emptyCell = measure.emptyValue === "zero" ? 0 : null;
    const series = seriesKeys.map((key) => ({
      id: key,
      label: key === "total" ? measure.label : (STRIPE_STATUS_LABELS[key] ?? key),
      values: aggs.get(key)!.map((a) =>
        a.count === 0 && measure.emptyValue !== "zero"
          ? emptyCell
          : measureValue(query.measure, a, currency),
      ),
    }));

    let compareSeries: ConnectedAnalyticsResult["compareSeries"] = null;
    if (query.compare === "previous_period" && !query.series) {
      const prevFrom = fromMs - (toMs - fromMs);
      const prev = applyFilters(input.prevFacts ?? [], query).filter(measure.eligible);
      const prevCurrency = measure.monetary
        ? resolveCurrencyConsistent(prev, currency)
        : null;
      const prevStarts = bucketStartsFor(grain, prevFrom, fromMs);
      const prevAggs = prevStarts.map(() => emptyAgg());
      for (const f of prev) {
        const ms = f.created * 1000;
        for (let i = prevStarts.length - 1; i >= 0; i--) {
          if (ms >= prevStarts[i]!) { prevAggs[i]!.count += 1; prevAggs[i]!.minorSum += f.amount; break; }
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
        // The previous window's own boundaries, index-aligned to the current
        // buckets — a previous-period point drills into ITS real dates and the
        // browser never reconstructs calendar boundaries (CD-5B).
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

  // ── Categorical (status / currency — count measures only, per catalog) ────
  const keyOf =
    query.dimension === "status"
      ? (f: ChargeFact) => f.status
      : (f: ChargeFact) => f.currency.toLowerCase();
  const groups = new Map<string, Agg>();
  for (const f of eligible) {
    const k = keyOf(f);
    const a = groups.get(k) ?? emptyAgg();
    a.count += 1;
    a.minorSum += f.amount;
    groups.set(k, a);
  }
  let rows = [...groups.entries()].map(([id, a]) => ({
    id,
    label:
      query.dimension === "status"
        ? (STRIPE_STATUS_LABELS[id] ?? id)
        : id.toUpperCase(),
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
    completeness: rowCapped && completeness.state === "complete"
      ? { state: "row_capped" }
      : completeness,
    kind: "categorical",
    dimension: query.dimension,
    grain: null,
    rows,
  };
}

/** Prev-window currency must be consistent with the main window's. */
function resolveCurrencyConsistent(
  prevEligible: readonly ChargeFact[],
  mainCurrency: string | null,
): string | null {
  const prev = resolveCurrency(prevEligible);
  if (prev && mainCurrency && prev !== mainCurrency) {
    throw new ConnectedAnalyticsError(MIXED_CURRENCY_MESSAGE, "MIXED_CURRENCY");
  }
  return prev ?? mainCurrency;
}
