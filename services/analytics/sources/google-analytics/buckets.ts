/**
 * Pure date-bucketing + value-parsing + property-id validation helpers for the
 * Google Analytics (GA4) analytics source (Slice ANALYTICS-SOURCES-GA-1). No I/O —
 * unit tested directly.
 *
 * The date window + bucket plan are built HERE from the dashboard range; widget
 * config never supplies a raw GA report definition. The GA4 `date` dimension
 * returns one row per calendar day (`YYYYMMDD`); over-time series sum those daily
 * aggregates into the bucket plan so the rendered series matches the other
 * connected-app providers' bounded (≤ MAX_BUCKETS) shape. Only the approved
 * scalar/series METRIC VALUES + the `date` dimension are ever read — never a user
 * id, client id, page path, URL, search term, or geo/device dimension.
 */

export const MAX_BUCKETS = 12;
const DAY_MS = 86_400_000;

export interface GaTimeBucket {
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
): GaTimeBucket[] {
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

  const buckets: GaTimeBucket[] = [];
  for (let s = startDay; s <= endDay; s += bucketDays * DAY_MS) {
    buckets.push({ key: utcDate(s), startMs: s, endMs: s + bucketDays * DAY_MS });
  }
  return buckets;
}

/** Index of the bucket containing `ms` (start inclusive, end exclusive), or -1. */
export function bucketIndexForMs(buckets: readonly GaTimeBucket[], ms: number | null): number {
  if (ms === null) return -1;
  for (let i = 0; i < buckets.length; i++) {
    if (ms >= buckets[i]!.startMs && ms < buckets[i]!.endMs) return i;
  }
  return -1;
}

/**
 * Parse a GA4 `date` dimension value (`YYYYMMDD`, property-timezone calendar day)
 * into a UTC-midnight epoch ms, or null when malformed. GA may also emit the
 * special bucket `(other)` for sampled/over-cardinality rows — that parses to null
 * and is dropped from the series (never bucketed, never surfaced).
 */
export function parseGaDate(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month - 1, day);
  return Number.isNaN(ms) ? null : ms;
}

/** Convert an ISO timestamp to the GA4 `startDate`/`endDate` form (`YYYY-MM-DD`). */
export function toGaDate(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(startOfUtcDay(ms)).toISOString().slice(0, 10);
}

/**
 * Parse a numeric scalar/metric value GA returns as a string (e.g. `"1234"` /
 * `"12.5"`). Non-finite / non-numeric → 0. Rounded to an integer for the
 * count-style metrics this source exposes (active/total users, sessions,
 * page views, events). Never reads a dimension VALUE other than `date`.
 */
export function parseMetricValue(value: unknown): number {
  if (typeof value !== "string" && typeof value !== "number") return 0;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

/**
 * Validate the REQUIRED `ga_property` filter into a safe GA4 property id (from the
 * `google-analytics:properties_flat` picker, id-as-value). GA4 property ids are
 * numeric strings (the `properties/{id}` resource name stripped). This is the
 * defense-in-depth check before the id is URL-encoded into the Data API path.
 * Throws on a bad value (the adapter maps the throw to INVALID_QUERY). There is no
 * "all properties" fallback — every GA metric is scoped to one validated property.
 */
export function parsePropertyId(value: unknown): string {
  if (typeof value !== "string") throw new Error("Pick a Google Analytics property for this widget.");
  const v = value.trim();
  if (v.length === 0 || v.length > 20 || !/^\d+$/.test(v)) {
    throw new Error("Pick a Google Analytics property for this widget.");
  }
  return v;
}
