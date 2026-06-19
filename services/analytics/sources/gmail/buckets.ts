/**
 * Pure bucketing + query-builders + validation for the Gmail analytics source
 * (Slice ANALYTICS-SOURCES-GMAIL-1). No I/O — unit tested directly.
 *
 * All Gmail search queries are built HERE from APPROVED constants + a validated
 * date window / label id. Widget config never supplies a raw Gmail query string,
 * so there is no search-syntax injection surface. Only message COUNTS are derived
 * from these queries — never bodies, subjects, senders, or recipients.
 */

export const MAX_BUCKETS = 12;
const DAY_MS = 86_400_000;

export interface GmailTimeBucket {
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
): GmailTimeBucket[] {
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

  const buckets: GmailTimeBucket[] = [];
  for (let s = startDay; s <= endDay; s += bucketDays * DAY_MS) {
    buckets.push({ key: utcDate(s), startMs: s, endMs: s + bucketDays * DAY_MS });
  }
  return buckets;
}

/** Gmail `after:`/`before:` date format (YYYY/MM/DD, UTC). */
export function gmailDate(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}/${mm}/${dd}`;
}

/** `after:<start> before:<end>` for a [startMs, endMs) window. */
export function dateRangeQuery(startMs: number, endMs: number): string {
  return `after:${gmailDate(startMs)} before:${gmailDate(endMs)}`;
}

/**
 * APPROVED base queries. These are server-owned constants — never user input.
 * "received" = anything that isn't sent/draft/chat/spam/trash (i.e. mail that
 * arrived), so it captures received mail even after it's been archived.
 */
export const RECEIVED_BASE_QUERY = "-in:sent -in:draft -in:chats -in:spam -in:trash";
export const SENT_BASE_QUERY = "in:sent";
/** Current-state unread in the inbox (not date-bound). */
export const UNREAD_QUERY = "is:unread in:inbox";

/**
 * Validate the `label` filter into a safe Gmail label id. Label ids are system
 * (e.g. INBOX / UNREAD / CATEGORY_PERSONAL) or user (`Label_123`) — alphanumerics,
 * underscore, dash only. The value comes from the `gmail:labels` picker; this is
 * the defense-in-depth server-side check. Passed via the `labelIds` API param (not
 * interpolated into the query), so this is shape validation. Throws on a bad value.
 */
const LABEL_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function parseLabelId(value: unknown): string {
  if (typeof value !== "string" || !LABEL_ID_RE.test(value)) {
    throw new Error("Pick a Gmail label for this widget.");
  }
  return value;
}
