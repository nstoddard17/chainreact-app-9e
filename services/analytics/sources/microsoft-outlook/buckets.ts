/**
 * Pure bucketing + Graph $filter builders for the Outlook mail analytics source
 * (Slice ANALYTICS-SOURCES-OUTLOOK-1). No I/O — unit tested directly.
 *
 * All Graph $filter clauses are built HERE from APPROVED constants + a validated
 * date window / folder id. Widget config never supplies a raw Graph $filter or
 * $search string, so there is no query-injection surface. Only message COUNTS are
 * derived from these queries — never bodies, previews, subjects, senders, or
 * recipients.
 */

export const MAX_BUCKETS = 12;
const DAY_MS = 86_400_000;

export interface OutlookTimeBucket {
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
): OutlookTimeBucket[] {
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

  const buckets: OutlookTimeBucket[] = [];
  for (let s = startDay; s <= endDay; s += bucketDays * DAY_MS) {
    buckets.push({ key: utcDate(s), startMs: s, endMs: s + bucketDays * DAY_MS });
  }
  return buckets;
}

// ─── Graph $filter builders (server-owned; never widget input) ────────────────

/** Graph datetime literal for `$filter` (RFC 3339, Z suffix). Unquoted, per Graph. */
export function toGraphDateTime(ms: number): string {
  return new Date(ms).toISOString();
}

/** Well-known Outlook folder names (Graph accepts these in place of a folder id). */
export const INBOX_FOLDER = "inbox";
export const SENT_FOLDER = "sentitems";

/** Current-state unread filter (used against the inbox folder). */
export const UNREAD_FILTER = "isRead eq false";

/** `receivedDateTime ge <start> and receivedDateTime lt <end>` for [startMs, endMs). */
export function receivedRangeFilter(startMs: number, endMs: number): string {
  return `receivedDateTime ge ${toGraphDateTime(startMs)} and receivedDateTime lt ${toGraphDateTime(endMs)}`;
}

/** `sentDateTime ge <start> and sentDateTime lt <end>` for [startMs, endMs). */
export function sentRangeFilter(startMs: number, endMs: number): string {
  return `sentDateTime ge ${toGraphDateTime(startMs)} and sentDateTime lt ${toGraphDateTime(endMs)}`;
}

/**
 * Validate the `folder` filter into a safe Graph folder id. Folder ids are
 * well-known names (`inbox`, `sentitems`, ...) or Graph's long base64url ids
 * (alphanumerics, `_`, `-`, `=` padding). The value comes from the
 * `microsoft-outlook:folders` picker; this is the defense-in-depth server-side
 * check before it is path-segment-encoded into the request URL. Throws on a bad value.
 */
const FOLDER_ID_RE = /^[A-Za-z0-9_=-]{1,256}$/;

export function parseFolderId(value: unknown): string {
  if (typeof value !== "string" || !FOLDER_ID_RE.test(value)) {
    throw new Error("Pick an Outlook folder for this widget.");
  }
  return value;
}
