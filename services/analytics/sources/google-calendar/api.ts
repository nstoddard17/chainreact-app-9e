import { eventsList } from "@/integrations/google-calendar/api/eventsList";
import type { CalendarEventTimes } from "./buckets";

/**
 * Bounded, READ-ONLY Google Calendar reader for the analytics source (Slice
 * ANALYTICS-SOURCES-GCAL-1). Reuses the shared `events.list` wrapper (same Bearer
 * auth + 401→Unauthorized401Error mapping as the Calendar action handlers).
 *
 * SAFETY — this is the chokepoint that prevents an unbounded calendar scan AND
 * privacy leakage:
 *   - ONE calendar per call, time-bounded by `timeMin`/`timeMax`.
 *   - `singleEvents: true` expands recurring events into instances so counts +
 *     hours are accurate.
 *   - HARD page cap ({@link MAX_PAGES} × {@link PAGE_SIZE}). Past the cap we stop
 *     and report `truncated: true` rather than paging the whole calendar.
 *   - EACH event is projected to {@link CalendarEventTimes} — only start/end times
 *     + status. Summary, attendees, description, location, conferencing links, and
 *     organizer are NEVER read, returned, or cached. Only derived numbers
 *     (counts / hours) ever leave the adapter.
 */

export const PAGE_SIZE = 250;
export const MAX_PAGES = 6;
/** Absolute ceiling on events scanned per widget query (1500). */
export const MAX_EVENTS = PAGE_SIZE * MAX_PAGES;

export interface FetchedEvents {
  events: readonly CalendarEventTimes[];
  /** True when the calendar had more in-window events than the page cap. */
  truncated: boolean;
}

/** Pull only the time + status fields. start/end carry `dateTime` (timed) or `date` (all-day). */
function project(raw: Readonly<Record<string, unknown>>): CalendarEventTimes {
  const out: CalendarEventTimes = {};
  const start = raw.start as { dateTime?: unknown } | undefined;
  const end = raw.end as { dateTime?: unknown } | undefined;
  if (start && typeof start.dateTime === "string") out.startDateTime = start.dateTime;
  if (end && typeof end.dateTime === "string") out.endDateTime = end.dateTime;
  if (typeof raw.status === "string") out.status = raw.status;
  return out;
}

/**
 * Fetch up to {@link MAX_EVENTS} events from one calendar within [timeMin, timeMax],
 * projected to time/status only. Throws `Unauthorized401Error` (→ refreshAndRetry
 * refresh path) / `NotFoundError` / generic `Error`; the adapter classifies them.
 */
export async function fetchCalendarEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<FetchedEvents> {
  const events: CalendarEventTimes[] = [];
  let pageToken: string | undefined;
  let truncated = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await eventsList({
      accessToken,
      calendarId,
      timeMin,
      timeMax,
      maxResults: PAGE_SIZE,
      singleEvents: true,
      orderBy: "startTime",
      ...(pageToken ? { pageToken } : {}),
    });

    for (const raw of result.items ?? []) {
      events.push(project(raw as Record<string, unknown>));
    }

    const next = result.nextPageToken;
    if (!next) return { events, truncated };
    pageToken = next;
    if (page === MAX_PAGES - 1) truncated = true; // more pages remain past the cap
  }

  return { events, truncated };
}
