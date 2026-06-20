/**
 * Pure time-bucketing + audience-id validation helpers for the Mailchimp analytics
 * source (Slice ANALYTICS-SOURCES-MAILCHIMP-1). No I/O — unit tested directly.
 *
 * The date window + bucket plan are built HERE from the dashboard range; widget
 * config never supplies a raw Mailchimp query. Only COUNTS are derived — never a
 * subscriber email/name/id, merge field, segment, campaign subject, or content.
 */

export const MAX_BUCKETS = 12;
const DAY_MS = 86_400_000;

export interface MailchimpTimeBucket {
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
): MailchimpTimeBucket[] {
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

  const buckets: MailchimpTimeBucket[] = [];
  for (let s = startDay; s <= endDay; s += bucketDays * DAY_MS) {
    buckets.push({ key: utcDate(s), startMs: s, endMs: s + bucketDays * DAY_MS });
  }
  return buckets;
}

/** Index of the bucket containing `ms` (start inclusive, end exclusive), or -1. */
export function bucketIndexForMs(buckets: readonly MailchimpTimeBucket[], ms: number | null): number {
  if (ms === null) return -1;
  for (let i = 0; i < buckets.length; i++) {
    if (ms >= buckets[i]!.startMs && ms < buckets[i]!.endMs) return i;
  }
  return -1;
}

/**
 * Validate the `mailchimp_audience` filter into a safe Mailchimp audience (list) id.
 * Mailchimp list ids are short alphanumeric tokens (e.g. "a1b2c3d4e5"). The value
 * comes from the `mailchimp:audiences` picker; this is the defense-in-depth
 * server-side check before it is used in the request path. Throws on a bad value
 * (the adapter maps the throw to INVALID_QUERY).
 */
const AUDIENCE_ID_RE = /^[A-Za-z0-9]{1,64}$/;

export function parseAudienceId(value: unknown): string {
  if (typeof value !== "string" || !AUDIENCE_ID_RE.test(value)) {
    throw new Error("Pick a Mailchimp audience for this widget.");
  }
  return value;
}
