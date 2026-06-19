/**
 * Pure time-bucketing + validation helpers for the Google Calendar analytics
 * source (Slice ANALYTICS-SOURCES-GCAL-1). No I/O — unit tested directly.
 *
 * Calendar has no count endpoint, so the adapter fetches a BOUNDED window of
 * events once (api.ts) and reduces them here. Only TIME + STATUS are ever read
 * from an event — never summary / attendees / description / location / links — so
 * no sensitive detail flows into a metric or the cache.
 */

export const MAX_BUCKETS = 12;
const DAY_MS = 86_400_000;

export type GcalSeriesMetric = "meetings_over_time" | "meeting_hours_over_time";

export interface GcalTimeBucket {
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
): GcalTimeBucket[] {
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

  const buckets: GcalTimeBucket[] = [];
  for (let s = startDay; s <= endDay; s += bucketDays * DAY_MS) {
    buckets.push({ key: utcDate(s), startMs: s, endMs: s + bucketDays * DAY_MS });
  }
  return buckets;
}

/** Index of the bucket a UTC-ms falls in, or -1. */
export function bucketIndexForMs(buckets: readonly GcalTimeBucket[], ms: number): number {
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i]!;
    if (ms >= b.startMs && ms < b.endMs) return i;
  }
  return -1;
}

/**
 * Validate the `calendar` filter. Defaults to `"primary"` (the viewer's main
 * calendar) when absent/empty — a safe default needing no calendar-list scope.
 * A supplied id must be a plausible calendar id (no whitespace / control chars;
 * length-capped) — calendar ids are `"primary"`, an email, or
 * `…@group.calendar.google.com`. The value is URL-encoded by the API wrapper, so
 * this is shape validation, not escaping. Throws on a malformed non-empty value.
 */
const CALENDAR_ID_RE = /^[A-Za-z0-9._%+\-@#~/=]{1,256}$/;

export function parseCalendarId(value: unknown): string {
  if (value === undefined || value === null || value === "") return "primary";
  if (typeof value !== "string" || !CALENDAR_ID_RE.test(value)) {
    throw new Error("Enter a valid calendar ID (or leave blank for your primary calendar).");
  }
  return value;
}

/** A minimal, sensitive-field-free event projection (api.ts produces these). */
export interface CalendarEventTimes {
  /** ISO instant for a TIMED event start; absent for all-day events. */
  startDateTime?: string;
  /** ISO instant for a TIMED event end; absent for all-day events. */
  endDateTime?: string;
  /** Google event status (e.g. "confirmed" | "cancelled"). */
  status?: string;
}

/** A timed (non-all-day), non-cancelled event = a "meeting" for v1 metrics. */
export function isTimedMeeting(ev: CalendarEventTimes): boolean {
  return (
    typeof ev.startDateTime === "string" &&
    ev.startDateTime.length > 0 &&
    ev.status !== "cancelled"
  );
}

/** UTC-midnight ms for a YYYY-MM-DD date string (NaN-safe → null). */
export function dateStrToUtcMs(dateStr: string): number | null {
  const ms = Date.parse(`${dateStr}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

/** Wall-clock date (YYYY-MM-DD) of a timed event's start, or null. */
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
