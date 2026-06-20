/**
 * Pure day-bucketing + page-id validation helpers for the Facebook analytics source
 * (Slice ANALYTICS-SOURCES-FACEBOOK-1). No I/O — unit tested directly.
 *
 * The date window + bucket plan are built HERE from the dashboard range; widget config
 * never supplies a raw Graph query. Only COUNTS + post created_time timestamps are
 * derived — never a post message, comment, reaction, or user identity.
 */

export const MAX_BUCKETS = 12;
const DAY_MS = 86_400_000;

export interface FacebookTimeBucket {
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
): FacebookTimeBucket[] {
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

  const buckets: FacebookTimeBucket[] = [];
  for (let s = startDay; s <= endDay; s += bucketDays * DAY_MS) {
    buckets.push({ key: utcDate(s), startMs: s, endMs: s + bucketDays * DAY_MS });
  }
  return buckets;
}

/** Index of the bucket containing `ms` (start inclusive, end exclusive), or -1. */
export function bucketIndexForMs(buckets: readonly FacebookTimeBucket[], ms: number | null): number {
  if (ms === null) return -1;
  for (let i = 0; i < buckets.length; i++) {
    if (ms >= buckets[i]!.startMs && ms < buckets[i]!.endMs) return i;
  }
  return -1;
}

/**
 * Validate the REQUIRED `facebook_page` filter into a safe Page id. Facebook Page ids
 * are numeric strings (from the `facebook:pages` picker, id-as-value). This is the
 * defense-in-depth check before the id is interpolated into a Graph path. Throws on a
 * bad value (the adapter maps the throw to INVALID_QUERY). There is no "all pages"
 * fallback — page-scoped metrics are always scoped to one validated id.
 */
export function parsePageId(value: unknown): string {
  if (typeof value !== "string") throw new Error("Pick a Facebook Page for this widget.");
  const v = value.trim();
  if (!/^\d{1,32}$/.test(v)) throw new Error("Pick a Facebook Page for this widget.");
  return v;
}
