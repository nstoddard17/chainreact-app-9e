import {
  ConnectedAnalyticsError,
  type ConnectedAnalyticsQuery,
} from "@/contracts/connectedAnalytics";
import { minorUnitsToMajor, roundToCurrency } from "@/core/analytics/money";
import {
  FALLBACK_SCALE_CURRENCY,
  type InvoiceFact,
} from "@/services/analytics/sources/quickbooks/api";

/**
 * QuickBooks Invoices MEASURE SEMANTICS (CD-4B) — the honesty contract for
 * this dataset, split from `aggregate.ts` (which owns only the shaping) so the
 * business rules read as one page.
 *
 *   - invoice_count           = every invoice whose TxnDate falls in the window.
 *   - total_invoiced_amount   = Σ ORIGINAL invoice totals. This is what was
 *     BILLED — not revenue recognised, not cash collected, not profit. An
 *     invoice counts in full on the day it was issued even if never paid.
 *   - avg_invoice_amount      = total ÷ invoices WITH a usable total (never
 *     divided by invoices whose amount couldn't be read); null when none.
 *   - outstanding_balance     = Σ balances still owed, AS OF NOW.
 *   - outstanding_invoice_count = how many invoices still owe something.
 *
 * HISTORICAL vs CURRENT-STATE — the distinction this dataset exists to
 * respect: QuickBooks reports ONE balance per invoice, its balance at query
 * time. There is no balance history. Grouping today's balances by their
 * invoices' old transaction dates would draw a chart that LOOKS like "what I
 * was owed back then" and is nothing of the sort — an invoice issued in
 * January and paid in March contributes 0 to January. So the two
 * `currentState` measures declare no `time` dimension in the catalog, are
 * rejected server-side if one is crafted (validateQuery), and support no
 * period comparison: "outstanding balance in the previous period" has no
 * meaning when only one snapshot exists.
 */

export const QUICKBOOKS_PAID_STATUS_LABELS: Readonly<Record<string, string>> = {
  paid: "Paid",
  outstanding: "Outstanding",
};

export const PAID_STATUS_ORDER = ["outstanding", "paid"] as const;

/**
 * Paid/open derivation — live-certified against the connected company
 * (6 paid / 19 outstanding / 0 negative balances, balance ≤ total on 25/25).
 *
 * Deliberately derived from the BALANCE alone so the two categories PARTITION
 * every scanned invoice: exactly one is true for any invoice, which is what
 * makes a part-to-whole donut of invoice count truthful. Note this differs
 * from the action-layer `ProjectedQuickbooksInvoice.paid` flag, which also
 * requires a positive total and so leaves a zero-total invoice in neither
 * bucket — a third residual state would silently break the donut denominator.
 * A zero-total invoice owes nothing, so it belongs in "Paid"; a credited
 * (negative) balance likewise owes nothing.
 */
export function paidStatusOf(fact: InvoiceFact): "paid" | "outstanding" {
  return fact.balanceMinor !== null && fact.balanceMinor > 0 ? "outstanding" : "paid";
}

export const MIXED_CURRENCY_MESSAGE =
  "This amount includes more than one currency. Filter to one currency or chart Invoice count instead.";

export const MISSING_CURRENCY_WARNING =
  "QuickBooks didn't report a currency for these invoices, so amounts are shown without a currency symbol.";

export interface MeasureSpec {
  label: string;
  monetary: boolean;
  emptyValue: "zero" | "null";
  /** Which invoices this measure is computed over. */
  eligible: (f: InvoiceFact) => boolean;
  /** Which minor-unit field this measure accumulates (null for counts). */
  amountOf: ((f: InvoiceFact) => number) | null;
  /** Current-state measures describe NOW and can never be charted over time. */
  currentState: boolean;
}

export const QUICKBOOKS_INVOICE_MEASURES: Readonly<Record<string, MeasureSpec>> = {
  invoice_count: {
    label: "Invoice count",
    monetary: false,
    emptyValue: "zero",
    eligible: () => true,
    amountOf: null,
    currentState: false,
  },
  total_invoiced_amount: {
    label: "Total invoiced amount",
    monetary: true,
    emptyValue: "zero",
    eligible: (f) => f.totalMinor !== null,
    amountOf: (f) => f.totalMinor ?? 0,
    currentState: false,
  },
  avg_invoice_amount: {
    label: "Average invoice amount",
    monetary: true,
    emptyValue: "null",
    eligible: (f) => f.totalMinor !== null,
    amountOf: (f) => f.totalMinor ?? 0,
    currentState: false,
  },
  outstanding_balance: {
    label: "Outstanding balance",
    monetary: true,
    emptyValue: "zero",
    // Only invoices that still owe something. A paid invoice contributes 0 to
    // the sum either way, but excluding it also keeps the by-customer
    // breakdown to customers who actually owe money.
    eligible: (f) => f.balanceMinor !== null && f.balanceMinor > 0,
    amountOf: (f) => f.balanceMinor ?? 0,
    currentState: true,
  },
  outstanding_invoice_count: {
    label: "Outstanding invoices",
    monetary: false,
    emptyValue: "zero",
    eligible: (f) => f.balanceMinor !== null && f.balanceMinor > 0,
    amountOf: null,
    currentState: true,
  },
};

export interface Agg {
  count: number;
  minorSum: number;
}
export const emptyAgg = (): Agg => ({ count: 0, minorSum: 0 });

/**
 * Emit one measure value: counts straight through, money converted from the
 * integer minor-unit accumulator exactly once and rounded to the currency's
 * own precision.
 */
export function measureValue(
  measureId: string,
  agg: Agg,
  currency: string | null,
): number | null {
  const m = QUICKBOOKS_INVOICE_MEASURES[measureId]!;
  if (!m.monetary) return agg.count;
  const scale = currency ?? FALLBACK_SCALE_CURRENCY;
  if (measureId === "avg_invoice_amount") {
    if (agg.count === 0) return null;
    return roundToCurrency(minorUnitsToMajor(agg.minorSum, scale) / agg.count, scale);
  }
  return roundToCurrency(minorUnitsToMajor(agg.minorSum, scale), scale);
}

/** Local filters over the BOUNDED scan (customer is pushed server-side). */
export function applyFilters(
  facts: readonly InvoiceFact[],
  query: ConnectedAnalyticsQuery,
): readonly InvoiceFact[] {
  const statuses = query.filters?.["paid_status"];
  const currencies = query.filters?.["currency"];
  const statusSet = Array.isArray(statuses) ? new Set(statuses) : null;
  const currencySet = Array.isArray(currencies)
    ? new Set(currencies.map((c) => c.toLowerCase()))
    : null;
  return facts.filter(
    (f) =>
      (!statusSet || statusSet.has(paidStatusOf(f))) &&
      (!currencySet || (f.currency !== null && currencySet.has(f.currency))),
  );
}

/** Single-currency resolution for monetary measures; MIXED_CURRENCY when >1. */
export function resolveCurrency(eligible: readonly InvoiceFact[]): string | null {
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
  prevEligible: readonly InvoiceFact[],
  mainCurrency: string | null,
): string | null {
  const prev = resolveCurrency(prevEligible);
  if (prev && mainCurrency && prev !== mainCurrency) {
    throw new ConnectedAnalyticsError(MIXED_CURRENCY_MESSAGE, "MIXED_CURRENCY");
  }
  return prev ?? mainCurrency;
}

/** A TxnDate (`YYYY-MM-DD`) as the UTC midnight that starts that day. */
export function txnDateMs(fact: InvoiceFact): number | null {
  if (!fact.txnDate) return null;
  const ms = Date.parse(`${fact.txnDate}T00:00:00.000Z`);
  return Number.isNaN(ms) ? null : ms;
}
