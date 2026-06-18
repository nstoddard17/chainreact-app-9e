/**
 * Pure time-bucketing + validation helpers for the Slack analytics source
 * (Slice ANALYTICS-SOURCES-SLACK-1). No I/O — unit tested directly.
 *
 * Unlike GitHub (whose Search API returns an exact count per query), Slack has no
 * count endpoint: we fetch a BOUNDED window of `conversations.history` once and
 * bucket the returned messages in memory. So bucketing here is pure arithmetic
 * over message timestamps, and the number of buckets is capped only to keep the
 * series readable (the API call volume is bounded separately in `api.ts`).
 */

export const MAX_BUCKETS = 12;
const DAY_MS = 86_400_000;

export type SlackSeriesMetric = "messages_over_time" | "keyword_mentions";
export type SlackScalarMetric = "active_users_count" | "channel_activity_count";

export interface SlackTimeBucket {
  /** Stable key + axis label (the bucket's start date, YYYY-MM-DD UTC). */
  key: string;
  /** Inclusive start (epoch ms, UTC day start). */
  startMs: number;
  /** Exclusive end (epoch ms). A message at exactly endMs belongs to the next bucket. */
  endMs: number;
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function utcDate(ms: number): string {
  return new Date(startOfUtcDay(ms)).toISOString().slice(0, 10);
}

/**
 * Split [since, until) into ≤ MAX_BUCKETS contiguous day-aligned buckets.
 * Granularity widens (day → week → month → coarser) so the count stays capped.
 * Returns [] for an invalid/empty window (caller surfaces a warning).
 */
export function planBuckets(
  sinceIso: string,
  untilIso: string,
  maxBuckets = MAX_BUCKETS,
): SlackTimeBucket[] {
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

  const buckets: SlackTimeBucket[] = [];
  for (let s = startDay; s <= endDay; s += bucketDays * DAY_MS) {
    const endMs = s + bucketDays * DAY_MS;
    buckets.push({ key: utcDate(s), startMs: s, endMs });
  }
  return buckets;
}

/**
 * Validate the `channel` filter into a safe Slack channel id.
 *
 * SECURITY: only PUBLIC (`C…`) and PRIVATE (`G…`) channel ids are accepted. DM
 * (`D…`) and any other shape are rejected so an analytics widget can never be
 * pointed at a direct message — even though the bot token might technically have
 * `im:history`. The value always originates from the `slack:channels` picker
 * (which lists public + private channels only); this is the defense-in-depth
 * server-side check. Throws a plain Error the adapter maps to INVALID_QUERY.
 */
const CHANNEL_RE = /^[CG][A-Z0-9]{6,}$/;

export function parseChannelRef(value: unknown): string {
  if (typeof value !== "string" || !CHANNEL_RE.test(value)) {
    throw new Error("Pick a Slack channel for this widget.");
  }
  return value;
}

/**
 * Validate the `keyword` filter (keyword_mentions only). Trimmed, 2–80 chars.
 * The keyword is matched as a plain case-insensitive substring against message
 * text server-side — never interpolated into a Slack API query — so there is no
 * search-syntax injection surface.
 */
export function parseKeyword(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Enter a keyword to count mentions of.");
  }
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 80) {
    throw new Error("Enter a keyword between 2 and 80 characters.");
  }
  return trimmed;
}

/**
 * Convert an ISO-8601 instant to a Slack message timestamp string
 * ("1730000000.000000"). Slack's `oldest` / `latest` bounds use this form.
 */
export function isoToSlackTs(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "0";
  return `${Math.floor(ms / 1000)}.000000`;
}

/**
 * Parse a Slack message `ts` ("1730000000.000123") into epoch ms. Returns null
 * for a missing/malformed value so the caller can skip the message.
 */
export function slackTsToMs(ts: unknown): number | null {
  if (typeof ts !== "string") return null;
  const seconds = Number.parseFloat(ts);
  if (!Number.isFinite(seconds)) return null;
  return Math.round(seconds * 1000);
}

/** Index of the bucket a message at `ms` falls in, or -1 when out of range. */
export function bucketIndexForMs(buckets: readonly SlackTimeBucket[], ms: number): number {
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i]!;
    if (ms >= b.startMs && ms < b.endMs) return i;
  }
  return -1;
}
