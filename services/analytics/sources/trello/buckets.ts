/**
 * Pure bucketing + validation helpers for the Trello analytics source
 * (Slice ANALYTICS-SOURCES-TRELLO-1). No I/O — unit tested directly.
 *
 * Only card TIMING (created-from-id, due) + structural ids (idList) + the
 * open/closed + dueComplete flags are ever read from a card — never the card
 * name, description, comments, checklists, members, attachments, or url — so no
 * sensitive detail flows into a metric or the cache.
 */

export const MAX_BUCKETS = 12;
const DAY_MS = 86_400_000;

export interface TrelloTimeBucket {
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
): TrelloTimeBucket[] {
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

  const buckets: TrelloTimeBucket[] = [];
  for (let s = startDay; s <= endDay; s += bucketDays * DAY_MS) {
    buckets.push({ key: utcDate(s), startMs: s, endMs: s + bucketDays * DAY_MS });
  }
  return buckets;
}

/** Index of the bucket a UTC-ms falls in, or -1 (also -1 for null). */
export function bucketIndexForMs(buckets: readonly TrelloTimeBucket[], ms: number | null): number {
  if (ms === null) return -1;
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i]!;
    if (ms >= b.startMs && ms < b.endMs) return i;
  }
  return -1;
}

/**
 * Validate the `board` filter into a safe Trello board id. Trello object ids are
 * 24-char lowercase hex. The value comes from the `trello:boards` picker; this is
 * the defense-in-depth server-side check before it is path-segment-encoded into the
 * request URL. Throws on a bad value.
 */
const BOARD_ID_RE = /^[a-f0-9]{24}$/;

export function parseBoardId(value: unknown): string {
  if (typeof value !== "string" || !BOARD_ID_RE.test(value)) {
    throw new Error("Pick a Trello board for this widget.");
  }
  return value;
}

/**
 * Trello object ids embed their creation time: the first 8 hex chars are the
 * Unix-seconds timestamp. Derives a card's created-ms FROM THE ID without ever
 * returning or storing the id. Returns null for a non-hex/short id.
 */
export function cardCreatedMs(id: string): number | null {
  if (typeof id !== "string" || !/^[a-f0-9]{8}/.test(id)) return null;
  const seconds = parseInt(id.slice(0, 8), 16);
  return Number.isNaN(seconds) ? null : seconds * 1000;
}
