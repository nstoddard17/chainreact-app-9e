/**
 * Pure bucketing + currency helpers for the Stripe analytics source
 * (Slice ANALYTICS-SOURCES-STRIPE-1). No I/O — unit tested directly.
 *
 * The date window + bucket plan are built HERE from the dashboard range; widget
 * config never supplies a raw Stripe query. Only payment COUNTS and summed
 * AMOUNTS are derived — never customer ids, descriptions, receipts, card detail,
 * or any individual charge identity.
 */

export const MAX_BUCKETS = 12;
const DAY_MS = 86_400_000;

export interface StripeTimeBucket {
  /** Stable key + axis label (bucket start date, YYYY-MM-DD UTC). */
  key: string;
  /** Inclusive start (epoch ms, UTC day start). */
  startMs: number;
  /** Exclusive end (epoch ms). */
  endMs: number;
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function utcDate(ms: number): string {
  return new Date(startOfUtcDay(ms)).toISOString().slice(0, 10);
}

/** Split [since, until) into ≤ MAX_BUCKETS day-aligned buckets ([] for invalid). */
export function planBuckets(
  sinceIso: string,
  untilIso: string,
  maxBuckets = MAX_BUCKETS,
): StripeTimeBucket[] {
  const since = Date.parse(sinceIso);
  const until = Date.parse(untilIso);
  if (Number.isNaN(since) || Number.isNaN(until) || until <= since) return [];

  const startDay = startOfUtcDay(since);
  const endDay = startOfUtcDay(until);
  const spanDays = Math.floor((endDay - startDay) / DAY_MS) + 1;

  let bucketDays: number;
  if (spanDays <= 14) bucketDays = 1;
  else if (spanDays <= 84) bucketDays = 7;
  else bucketDays = 30;
  if (Math.ceil(spanDays / bucketDays) > maxBuckets) {
    bucketDays = Math.ceil(spanDays / maxBuckets);
  }

  const buckets: StripeTimeBucket[] = [];
  for (let s = startDay; s <= endDay; s += bucketDays * DAY_MS) {
    buckets.push({ key: utcDate(s), startMs: s, endMs: s + bucketDays * DAY_MS });
  }
  return buckets;
}

/** Index of the bucket containing `ms` (start inclusive, end exclusive), or -1. */
export function bucketIndexForMs(buckets: readonly StripeTimeBucket[], ms: number): number {
  for (let i = 0; i < buckets.length; i++) {
    if (ms >= buckets[i]!.startMs && ms < buckets[i]!.endMs) return i;
  }
  return -1;
}

// ─── Currency (minor-unit → major-unit) ──────────────────────────────────────

/**
 * Currency decimals come from the canonical analytics money table
 * (`core/analytics/money`), shared with the QuickBooks money path so the
 * zero-/three-decimal lists can't drift apart between providers. Re-exported
 * here because this module has been Stripe's money seam since
 * ANALYTICS-SOURCES-STRIPE-1.
 */
export { currencyDecimals, minorUnitsToMajor as minorToMajor } from "@/core/analytics/money";

/** Round a major-unit amount to 2 dp to avoid float-accumulation noise. */
export function roundMajor(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface DominantCurrency {
  /** Lowercase ISO code with the most charges, or null when there are none. */
  currency: string | null;
  /** True when more than one currency was present (volume picks the dominant). */
  multiCurrency: boolean;
}

/**
 * The currency carrying the most charges in `facts` (already filtered to the set
 * being summed). Volume metrics sum ONLY this currency so a scalar/series total is
 * never a meaningless cross-currency sum; `multiCurrency` flags that others were
 * excluded (the adapter surfaces a warning).
 */
export function dominantCurrency(facts: readonly { currency: string }[]): DominantCurrency {
  const counts = new Map<string, number>();
  for (const f of facts) {
    const c = f.currency.toLowerCase();
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  if (counts.size === 0) return { currency: null, multiCurrency: false };
  let best: string | null = null;
  let bestN = -1;
  for (const [cur, n] of counts) {
    if (n > bestN) {
      best = cur;
      bestN = n;
    }
  }
  return { currency: best, multiCurrency: counts.size > 1 };
}
