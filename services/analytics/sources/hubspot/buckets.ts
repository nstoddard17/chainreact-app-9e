/**
 * Pure time-bucketing + pipeline-id validation helpers for the HubSpot analytics
 * source (Slice ANALYTICS-SOURCES-HUBSPOT-1). No I/O — unit tested directly.
 *
 * The HubSpot adapter computes a created-over-time series by asking the CRM
 * Search API for the `total` count in each bucket's [startMs, endMs) window
 * (a `createdate` range filter) — so the bucket boundaries here are the only
 * input the adapter needs. No CRM record is ever read to build the series.
 */

export const MAX_BUCKETS = 12;
const DAY_MS = 86_400_000;

export interface HubSpotTimeBucket {
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
): HubSpotTimeBucket[] {
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

  const buckets: HubSpotTimeBucket[] = [];
  for (let s = startDay; s <= endDay; s += bucketDays * DAY_MS) {
    buckets.push({ key: utcDate(s), startMs: s, endMs: s + bucketDays * DAY_MS });
  }
  return buckets;
}

/**
 * Validate the `hubspot_pipeline` filter into a safe HubSpot deal-pipeline id. Pipeline
 * ids are short tokens (`"default"` or numeric/alphanumeric portal ids). The value comes
 * from the `hubspot:deal_pipelines` picker; this is the defense-in-depth server-side check
 * before it is used as a Search filter value + matched against the fetched pipeline list.
 * Throws on a bad value (the adapter maps the throw to INVALID_QUERY).
 */
const PIPELINE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function parsePipelineId(value: unknown): string {
  if (typeof value !== "string" || !PIPELINE_ID_RE.test(value)) {
    throw new Error("Pick a HubSpot deal pipeline for this widget.");
  }
  return value;
}
