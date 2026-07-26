import {
  ConnectedAnalyticsError,
  type ConnectedAnalyticsQuery,
} from "@/contracts/connectedAnalytics";
import { minorUnitsToMajor, roundToCurrency } from "@/core/analytics/money";
import {
  FALLBACK_SCALE_CURRENCY,
  type ShopifyOrderFact,
} from "@/services/analytics/sources/shopify/insightOrders";

/**
 * Shopify Orders MEASURE SEMANTICS (CD-4C) — the honesty contract for this
 * dataset. `aggregate.ts` owns shaping only; every business rule reads here.
 *
 *   - order_count       = every matching order (a cancelled or refunded order
 *     is still an order that was placed; filters narrow it).
 *   - paid_order_count  = orders whose financial status is EXACTLY "paid".
 *     Not partially_paid, not authorized, not refunded-after-payment — the one
 *     certified paid state, no string-contains guessing.
 *   - total_order_amount = Σ of matching Shopify ORDER TOTALS — what was
 *     charged at checkout. It is NOT revenue, net sales, collected cash,
 *     payouts, or profit: refunds are not subtracted (complete refund amounts
 *     are not projected), and cancelled orders count unless filtered out.
 *   - avg_order_amount  = the same eligible totals ÷ their count; null when
 *     no matching order has a readable amount.
 *
 * TEST ORDERS: Shopify marks test-mode/Bogus-gateway orders `test: true`. The
 * DEFAULT for every measure is to EXCLUDE them — a merchant's business totals
 * must not include fake transactions. The catalog exposes an explicit
 * "Include test orders" toggle; only a literal `true` includes them.
 *
 * STATUS NORMALIZATION: financial and fulfillment statuses are normalized
 * into bounded, documented domains. Anything outside the domain maps to
 * "unknown" rather than leaking a raw provider string into labels — and
 * because every order maps to exactly ONE value of each domain, a count
 * breakdown by either status is a true partition, which is what makes the
 * donut honest.
 */

// ── Status domains ───────────────────────────────────────────────────────────

/** Documented financial_status domain, in display order. */
export const FINANCIAL_STATUS_ORDER = [
  "paid",
  "pending",
  "authorized",
  "partially_paid",
  "partially_refunded",
  "refunded",
  "voided",
  "unknown",
] as const;

export const FINANCIAL_STATUS_LABELS: Readonly<Record<string, string>> = {
  paid: "Paid",
  pending: "Pending",
  authorized: "Authorized",
  partially_paid: "Partially paid",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
  voided: "Voided",
  unknown: "Unknown",
};

/** Documented fulfillment_status domain (null = unfulfilled), display order. */
export const FULFILLMENT_STATUS_ORDER = [
  "unfulfilled",
  "partial",
  "fulfilled",
  "restocked",
  "unknown",
] as const;

export const FULFILLMENT_STATUS_LABELS: Readonly<Record<string, string>> = {
  unfulfilled: "Unfulfilled",
  partial: "Partially fulfilled",
  fulfilled: "Fulfilled",
  restocked: "Restocked",
  unknown: "Unknown",
};

const FINANCIAL_KNOWN: ReadonlySet<string> = new Set(
  FINANCIAL_STATUS_ORDER.filter((s) => s !== "unknown"),
);
const FULFILLMENT_KNOWN: ReadonlySet<string> = new Set(["partial", "fulfilled", "restocked"]);

/** Missing or out-of-domain → "unknown"; never a raw provider string. */
export function normalizeFinancialStatus(raw: string | null): string {
  if (raw === null) return "unknown";
  return FINANCIAL_KNOWN.has(raw) ? raw : "unknown";
}

/**
 * Shopify sends null for an unfulfilled order — normalized EXPLICITLY to
 * "unfulfilled" so the most common state is a first-class labelled category,
 * not null noise. Out-of-domain strings → "unknown".
 */
export function normalizeFulfillmentStatus(raw: string | null): string {
  if (raw === null) return "unfulfilled";
  return FULFILLMENT_KNOWN.has(raw) ? raw : "unknown";
}

export const CANCELLATION_LABELS: Readonly<Record<string, string>> = {
  active: "Active",
  cancelled: "Cancelled",
};

export function cancellationOf(fact: ShopifyOrderFact): "active" | "cancelled" {
  return fact.cancelled ? "cancelled" : "active";
}

// ── Money ────────────────────────────────────────────────────────────────────

export const MIXED_CURRENCY_MESSAGE =
  "This amount includes more than one currency. Filter to one currency or chart Order count instead.";

export const MISSING_CURRENCY_WARNING =
  "Shopify didn't report a currency for these orders, so amounts are shown without a currency symbol.";

// ── Measures ─────────────────────────────────────────────────────────────────

export interface MeasureSpec {
  label: string;
  monetary: boolean;
  emptyValue: "zero" | "null";
  eligible: (f: ShopifyOrderFact) => boolean;
  amountOf: ((f: ShopifyOrderFact) => number) | null;
}

export const SHOPIFY_ORDER_MEASURES: Readonly<Record<string, MeasureSpec>> = {
  order_count: {
    label: "Order count",
    monetary: false,
    emptyValue: "zero",
    eligible: () => true,
    amountOf: null,
  },
  paid_order_count: {
    label: "Paid order count",
    monetary: false,
    emptyValue: "zero",
    eligible: (f) => normalizeFinancialStatus(f.financialStatus) === "paid",
    amountOf: null,
  },
  total_order_amount: {
    label: "Total order amount",
    monetary: true,
    emptyValue: "zero",
    eligible: (f) => f.totalMinor !== null,
    amountOf: (f) => f.totalMinor ?? 0,
  },
  avg_order_amount: {
    label: "Average order amount",
    monetary: true,
    emptyValue: "null",
    eligible: (f) => f.totalMinor !== null,
    amountOf: (f) => f.totalMinor ?? 0,
  },
};

export interface Agg {
  count: number;
  minorSum: number;
}
export const emptyAgg = (): Agg => ({ count: 0, minorSum: 0 });

/** Counts pass through; money converts from integer minor units exactly once. */
export function measureValue(
  measureId: string,
  agg: Agg,
  currency: string | null,
): number | null {
  const m = SHOPIFY_ORDER_MEASURES[measureId]!;
  if (!m.monetary) return agg.count;
  const scale = currency ?? FALLBACK_SCALE_CURRENCY;
  if (measureId === "avg_order_amount") {
    if (agg.count === 0) return null;
    return roundToCurrency(minorUnitsToMajor(agg.minorSum, scale) / agg.count, scale);
  }
  return roundToCurrency(minorUnitsToMajor(agg.minorSum, scale), scale);
}

// ── Filters ──────────────────────────────────────────────────────────────────

/**
 * Local filters over the BOUNDED scan (created-time is pushed server-side).
 *
 * TEST-ORDER DEFAULT, stated once: test orders are excluded unless the
 * "Include test orders" toggle is literally `true`. `false` and absent are
 * identical — excluded.
 */
export function applyFilters(
  facts: readonly ShopifyOrderFact[],
  query: ConnectedAnalyticsQuery,
): readonly ShopifyOrderFact[] {
  const financial = query.filters?.["financial_status"];
  const fulfillment = query.filters?.["fulfillment_status"];
  const currencies = query.filters?.["currency"];
  const cancellation = query.filters?.["cancellation_state"];
  const includeTest = query.filters?.["include_test_orders"] === true;

  const financialSet = Array.isArray(financial) ? new Set(financial) : null;
  const fulfillmentSet = Array.isArray(fulfillment) ? new Set(fulfillment) : null;
  const currencySet = Array.isArray(currencies)
    ? new Set(currencies.map((c) => c.toLowerCase()))
    : null;
  const cancellationSet = Array.isArray(cancellation) ? new Set(cancellation) : null;

  return facts.filter(
    (f) =>
      (includeTest || !f.test) &&
      (!financialSet || financialSet.has(normalizeFinancialStatus(f.financialStatus))) &&
      (!fulfillmentSet || fulfillmentSet.has(normalizeFulfillmentStatus(f.fulfillmentStatus))) &&
      (!currencySet || (f.currency !== null && currencySet.has(f.currency))) &&
      (!cancellationSet || cancellationSet.has(cancellationOf(f))),
  );
}

/** Single-currency resolution for monetary measures; MIXED_CURRENCY when >1. */
export function resolveCurrency(eligible: readonly ShopifyOrderFact[]): string | null {
  const currencies = new Set(
    eligible.map((f) => f.currency).filter((c): c is string => c !== null),
  );
  if (currencies.size > 1) {
    throw new ConnectedAnalyticsError(MIXED_CURRENCY_MESSAGE, "MIXED_CURRENCY");
  }
  return currencies.size === 1 ? [...currencies][0]! : null;
}

/** Prev-window currency must be consistent with the main window's. */
export function resolveCurrencyConsistent(
  prevEligible: readonly ShopifyOrderFact[],
  mainCurrency: string | null,
): string | null {
  const prev = resolveCurrency(prevEligible);
  if (prev && mainCurrency && prev !== mainCurrency) {
    throw new ConnectedAnalyticsError(MIXED_CURRENCY_MESSAGE, "MIXED_CURRENCY");
  }
  return prev ?? mainCurrency;
}
