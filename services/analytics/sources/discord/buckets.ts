/**
 * Pure time-bucketing + snowflake-id validation helpers for the Discord analytics
 * source (Slice ANALYTICS-SOURCES-DISCORD-1). No I/O — unit tested directly.
 *
 * The date window + bucket plan are built HERE from the dashboard range; widget
 * config never supplies a raw Discord query. Only COUNTS + message timestamps are
 * derived — never message content, author, username, user id, or message id.
 *
 * The over-time series buckets by the message `timestamp` (Discord's authoritative
 * server send time).
 */

export const MAX_BUCKETS = 12;
const DAY_MS = 86_400_000;

export interface DiscordTimeBucket {
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
): DiscordTimeBucket[] {
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

  const buckets: DiscordTimeBucket[] = [];
  for (let s = startDay; s <= endDay; s += bucketDays * DAY_MS) {
    buckets.push({ key: utcDate(s), startMs: s, endMs: s + bucketDays * DAY_MS });
  }
  return buckets;
}

/** Index of the bucket containing `ms` (start inclusive, end exclusive), or -1. */
export function bucketIndexForMs(buckets: readonly DiscordTimeBucket[], ms: number | null): number {
  if (ms === null) return -1;
  for (let i = 0; i < buckets.length; i++) {
    if (ms >= buckets[i]!.startMs && ms < buckets[i]!.endMs) return i;
  }
  return -1;
}

/**
 * Validate a REQUIRED Discord snowflake id (guild or channel) from a picker
 * (id-as-value). Discord snowflakes are 64-bit ints rendered as decimal strings
 * (17-19 digits today; allow 15-21 for headroom). This is the defense-in-depth check
 * before the id is URL-encoded into a REST path. Throws on a bad value (the adapter
 * maps the throw to INVALID_QUERY). There is no "all servers" / "all channels"
 * fallback — these metrics are always scoped to one validated id.
 */
export function parseSnowflake(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`Pick a Discord ${label} for this widget.`);
  const v = value.trim();
  if (!/^\d{15,21}$/.test(v)) throw new Error(`Pick a Discord ${label} for this widget.`);
  return v;
}

/** Validate the required `discord_guild` filter into a safe guild snowflake. */
export function parseGuildId(value: unknown): string {
  return parseSnowflake(value, "server");
}

/** Validate the required `discord_channel` filter into a safe channel snowflake. */
export function parseChannelId(value: unknown): string {
  return parseSnowflake(value, "channel");
}
