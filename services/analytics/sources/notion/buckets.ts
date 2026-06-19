/**
 * Pure time-bucketing helpers for the Notion analytics source
 * (Slice ANALYTICS-SOURCES-NOTION-1). No I/O — unit tested directly.
 *
 * Notion's Search API has no count endpoint and no server-side date filter, so the
 * adapter fetches a BOUNDED set of accessible page objects once (api.ts) and
 * reduces them here. Only the `object` type + `created_time` / `last_edited_time`
 * timestamps + the `archived` flag are ever read from a hit — never title,
 * properties, block content, parent, or url — so no sensitive detail flows into a
 * metric or the cache.
 */

export const MAX_BUCKETS = 12;
const DAY_MS = 86_400_000;

export interface NotionTimeBucket {
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
): NotionTimeBucket[] {
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

  const buckets: NotionTimeBucket[] = [];
  for (let s = startDay; s <= endDay; s += bucketDays * DAY_MS) {
    buckets.push({ key: utcDate(s), startMs: s, endMs: s + bucketDays * DAY_MS });
  }
  return buckets;
}

/** Index of the bucket a UTC-ms falls in, or -1 (also -1 for null). */
export function bucketIndexForMs(buckets: readonly NotionTimeBucket[], ms: number | null): number {
  if (ms === null) return -1;
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i]!;
    if (ms >= b.startMs && ms < b.endMs) return i;
  }
  return -1;
}

/** True when `ms` is within [sinceMs, untilMs) (null → false). */
export function inRange(ms: number | null, sinceMs: number, untilMs: number): boolean {
  return ms !== null && ms >= sinceMs && ms < untilMs;
}
