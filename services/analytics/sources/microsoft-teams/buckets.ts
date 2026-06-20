/**
 * Pure time-bucketing + Graph-id validation helpers for the Microsoft Teams analytics
 * source (Slice ANALYTICS-SOURCES-TEAMS-1). No I/O — unit tested directly.
 *
 * The date window + bucket plan are built HERE from the dashboard range; widget config
 * never supplies a raw Graph query. Only COUNTS + message timestamps are derived —
 * never message content, subject, from, user id, or message id.
 *
 * The over-time series buckets by the message `createdDateTime` (Graph's authoritative
 * server send time).
 */

export const MAX_BUCKETS = 12;
const DAY_MS = 86_400_000;

export interface TeamsTimeBucket {
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
): TeamsTimeBucket[] {
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

  const buckets: TeamsTimeBucket[] = [];
  for (let s = startDay; s <= endDay; s += bucketDays * DAY_MS) {
    buckets.push({ key: utcDate(s), startMs: s, endMs: s + bucketDays * DAY_MS });
  }
  return buckets;
}

/** Index of the bucket containing `ms` (start inclusive, end exclusive), or -1. */
export function bucketIndexForMs(buckets: readonly TeamsTimeBucket[], ms: number | null): number {
  if (ms === null) return -1;
  for (let i = 0; i < buckets.length; i++) {
    if (ms >= buckets[i]!.startMs && ms < buckets[i]!.endMs) return i;
  }
  return -1;
}

/**
 * Validate a REQUIRED Microsoft Graph Teams id (team or channel) from a picker
 * (id-as-value). Team ids are GUIDs; channel ids look like `19:...@thread.tacv2`. Both
 * are opaque tokens; this is the defense-in-depth check before the id is URL-encoded
 * into a Graph path. Throws on a bad value (the adapter maps the throw to
 * INVALID_QUERY). There is no "all teams" / "all channels" fallback — these metrics
 * are always scoped to one validated id.
 */
export function parseGraphId(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`Pick a Microsoft Teams ${label} for this widget.`);
  const v = value.trim();
  // Opaque Graph ids: GUIDs + thread ids (alnum, plus : @ . _ - = + and %20-free).
  if (v.length === 0 || v.length > 256 || !/^[A-Za-z0-9:@._\-=+]+$/.test(v)) {
    throw new Error(`Pick a Microsoft Teams ${label} for this widget.`);
  }
  return v;
}

/** Validate the required `teams_team` filter into a safe team id. */
export function parseTeamId(value: unknown): string {
  return parseGraphId(value, "team");
}

/** Validate the required `teams_channel` filter into a safe channel id. */
export function parseChannelId(value: unknown): string {
  return parseGraphId(value, "channel");
}
