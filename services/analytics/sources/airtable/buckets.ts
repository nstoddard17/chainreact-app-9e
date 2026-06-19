/**
 * Pure time-bucketing + id-validation helpers for the Airtable analytics source
 * (Slice ANALYTICS-SOURCES-AIRTABLE-1). No I/O — unit tested directly.
 *
 * Only a record's `createdTime` is ever read from a record — never a cell value,
 * field, attachment, comment, or collaborator — so no sensitive detail flows into a
 * metric or the cache.
 */

export const MAX_BUCKETS = 12;
const DAY_MS = 86_400_000;

export interface AirtableTimeBucket {
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
): AirtableTimeBucket[] {
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

  const buckets: AirtableTimeBucket[] = [];
  for (let s = startDay; s <= endDay; s += bucketDays * DAY_MS) {
    buckets.push({ key: utcDate(s), startMs: s, endMs: s + bucketDays * DAY_MS });
  }
  return buckets;
}

/** Index of the bucket a UTC-ms falls in, or -1 (also -1 for null). */
export function bucketIndexForMs(buckets: readonly AirtableTimeBucket[], ms: number | null): number {
  if (ms === null) return -1;
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i]!;
    if (ms >= b.startMs && ms < b.endMs) return i;
  }
  return -1;
}

/**
 * Validate the `airtable_base` filter into a safe Airtable base id (`appXXX`). The
 * value comes from the `airtable:bases` picker; this is the defense-in-depth
 * server-side check before it is path-segment-encoded into the request URL. Throws
 * on a bad value.
 */
const BASE_ID_RE = /^app[A-Za-z0-9]{12,20}$/;

export function parseBaseId(value: unknown): string {
  if (typeof value !== "string" || !BASE_ID_RE.test(value)) {
    throw new Error("Pick an Airtable base for this widget.");
  }
  return value;
}

/**
 * Validate the `airtable_table` filter into a safe Airtable table id (`tblXXX`).
 * The `airtable:tables` picker's value is always a table id (rename-safe), so the
 * analytics adapter requires the id form (never a free-text table name) — no raw
 * name from widget config reaches the API. Throws on a bad value.
 */
const TABLE_ID_RE = /^tbl[A-Za-z0-9]{12,20}$/;

export function parseTableId(value: unknown): string {
  if (typeof value !== "string" || !TABLE_ID_RE.test(value)) {
    throw new Error("Pick an Airtable table for this widget.");
  }
  return value;
}
