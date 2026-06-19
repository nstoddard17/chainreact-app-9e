/**
 * Pure time-bucketing + validation helpers for the Outlook Calendar analytics
 * source (Slice ANALYTICS-SOURCES-OUTLOOK-CAL-1). No I/O — unit tested directly.
 *
 * Mirrors the Google Calendar helpers. Only TIME + all-day/cancelled FLAGS are
 * ever read from an event — never subject / attendees / body / location / online
 * links / organizer — so no sensitive detail flows into a metric or the cache.
 *
 * Microsoft Graph note: `calendarView` returns `start.dateTime` WITHOUT a timezone
 * designator (the zone is the separate `timeZone` field / the `Prefer:
 * outlook.timezone` request header). The analytics reader requests UTC, so
 * {@link normalizeGraphUtc} appends `Z` when no offset/Z is present so `Date.parse`
 * treats the value as UTC rather than local.
 */

export const MAX_BUCKETS = 12;
const DAY_MS = 86_400_000;

export interface OutlookCalTimeBucket {
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
): OutlookCalTimeBucket[] {
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

  const buckets: OutlookCalTimeBucket[] = [];
  for (let s = startDay; s <= endDay; s += bucketDays * DAY_MS) {
    buckets.push({ key: utcDate(s), startMs: s, endMs: s + bucketDays * DAY_MS });
  }
  return buckets;
}

/** Index of the bucket a UTC-ms falls in, or -1. */
export function bucketIndexForMs(buckets: readonly OutlookCalTimeBucket[], ms: number): number {
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i]!;
    if (ms >= b.startMs && ms < b.endMs) return i;
  }
  return -1;
}

/**
 * Validate the `outlook_calendar` filter into a safe Graph calendar id. EMPTY /
 * absent → `null` (use the viewer's primary calendar via `/me/calendarView`, no
 * id needed). A supplied id must be a Graph calendar id (base64url-ish:
 * alphanumerics, `_`, `-`, `=`), length-capped — it is path-segment-encoded into
 * the URL by the reader, so this is shape validation. Throws on a malformed
 * non-empty value. Returns the id or `null`.
 */
const CALENDAR_ID_RE = /^[A-Za-z0-9_=-]{1,256}$/;

export function parseCalendarId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !CALENDAR_ID_RE.test(value)) {
    throw new Error("Pick an Outlook calendar (or leave blank for your primary calendar).");
  }
  return value;
}

/** A minimal, sensitive-field-free event projection (api.ts produces these). */
export interface CalendarEventTimes {
  /** ISO-UTC instant for the event start (normalized with a Z suffix). */
  startDateTime?: string;
  /** ISO-UTC instant for the event end (normalized with a Z suffix). */
  endDateTime?: string;
  /** Graph `isAllDay`. */
  isAllDay?: boolean;
  /** Graph `isCancelled`. */
  isCancelled?: boolean;
}

/** Append `Z` to a Graph datetime that carries no timezone designator (treat as UTC). */
export function normalizeGraphUtc(dateTime: string): string {
  return /[Zz]|[+-]\d\d:?\d\d$/.test(dateTime) ? dateTime : `${dateTime}Z`;
}

/** A timed (non-all-day), non-cancelled event = a "meeting" for v1 metrics. */
export function isTimedMeeting(ev: CalendarEventTimes): boolean {
  return (
    typeof ev.startDateTime === "string" &&
    ev.startDateTime.length > 0 &&
    ev.isAllDay !== true &&
    ev.isCancelled !== true
  );
}

/** UTC-midnight ms for a YYYY-MM-DD date string (NaN-safe → null). */
export function dateStrToUtcMs(dateStr: string): number | null {
  const ms = Date.parse(`${dateStr}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

/** Wall-clock UTC date (YYYY-MM-DD) of a timed event's start, or null. */
export function eventStartDateStr(ev: CalendarEventTimes): string | null {
  if (typeof ev.startDateTime !== "string" || ev.startDateTime.length < 10) return null;
  return ev.startDateTime.slice(0, 10);
}

/** Duration in hours of a timed event (both endpoints present, positive), or null. */
export function eventDurationHours(ev: CalendarEventTimes): number | null {
  if (typeof ev.startDateTime !== "string" || typeof ev.endDateTime !== "string") return null;
  const start = Date.parse(ev.startDateTime);
  const end = Date.parse(ev.endDateTime);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return (end - start) / 3_600_000;
}

/** Day-of-week labels, Monday-first (matches busy_hours_by_day output order). */
export const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Monday-first day index (0=Mon … 6=Sun) for a YYYY-MM-DD date, or null. */
export function dayOfWeekMondayIndex(dateStr: string): number | null {
  const ms = dateStrToUtcMs(dateStr);
  if (ms === null) return null;
  const sundayFirst = new Date(ms).getUTCDay(); // 0=Sun … 6=Sat
  return (sundayFirst + 6) % 7; // → 0=Mon … 6=Sun
}
