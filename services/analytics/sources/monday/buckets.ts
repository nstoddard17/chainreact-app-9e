/**
 * Pure time-bucketing + board-id validation helpers for the Monday analytics
 * source (Slice ANALYTICS-SOURCES-MONDAY-1). No I/O — unit tested directly.
 *
 * Only an item's `created_at` + `group` id + `state` are ever read from an item —
 * never its name, column values, updates, files, or assignees — so no sensitive
 * detail flows into a metric or the cache.
 */

export const MAX_BUCKETS = 12;
const DAY_MS = 86_400_000;

export interface MondayTimeBucket {
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
): MondayTimeBucket[] {
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

  const buckets: MondayTimeBucket[] = [];
  for (let s = startDay; s <= endDay; s += bucketDays * DAY_MS) {
    buckets.push({ key: utcDate(s), startMs: s, endMs: s + bucketDays * DAY_MS });
  }
  return buckets;
}

/** Index of the bucket a UTC-ms falls in, or -1 (also -1 for null). */
export function bucketIndexForMs(buckets: readonly MondayTimeBucket[], ms: number | null): number {
  if (ms === null) return -1;
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i]!;
    if (ms >= b.startMs && ms < b.endMs) return i;
  }
  return -1;
}

/**
 * Validate the `monday_board` filter into a safe Monday board id. Monday board ids
 * are numeric strings. The value comes from the `monday:boards` picker; this is the
 * defense-in-depth server-side check before it is passed as a GraphQL variable.
 * Throws on a bad value.
 */
const BOARD_ID_RE = /^[0-9]{1,20}$/;

export function parseBoardId(value: unknown): string {
  if (typeof value !== "string" || !BOARD_ID_RE.test(value)) {
    throw new Error("Pick a Monday board for this widget.");
  }
  return value;
}
