import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";
import { normalizeGraphUtc, type CalendarEventTimes } from "./buckets";

/**
 * Bounded, READ-ONLY Microsoft Graph calendar reader for the analytics source
 * (Slice ANALYTICS-SOURCES-OUTLOOK-CAL-1).
 *
 * Deliberately does NOT reuse the workflow `eventsList` wrapper: that wrapper
 * `$select`s subject / bodyPreview / location / attendees / organizer / onlineMeeting
 * / webLink, which we must never fetch for analytics. This reader requests
 * `$select=start,end,isAllDay,isCancelled` ONLY — start/end times + two flags —
 * and projects each event to {@link CalendarEventTimes}. No subject, body,
 * location, attendee, organizer, or link is ever read, returned, or cached.
 *
 * Uses `/me/calendarView` (auto-expands recurrences into instances so counts +
 * hours are accurate), scoped to one calendar + a time window. The
 * `Prefer: outlook.timezone="UTC"` header makes Graph return start/end in UTC.
 *
 * SAFETY — bounded to prevent an unbounded calendar scan: a HARD page cap
 * ({@link MAX_PAGES} × {@link PAGE_SIZE}). Past the cap we stop and report
 * `truncated: true` rather than paging the whole calendar.
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

interface RawCalendarViewResponse {
  value?: Array<Record<string, unknown>>;
  "@odata.nextLink"?: string;
}

/** Pull only the time + all-day/cancelled flags. */
function project(raw: Record<string, unknown>): CalendarEventTimes {
  const out: CalendarEventTimes = {};
  const start = raw.start as { dateTime?: unknown } | undefined;
  const end = raw.end as { dateTime?: unknown } | undefined;
  if (start && typeof start.dateTime === "string") out.startDateTime = normalizeGraphUtc(start.dateTime);
  if (end && typeof end.dateTime === "string") out.endDateTime = normalizeGraphUtc(end.dateTime);
  if (typeof raw.isAllDay === "boolean") out.isAllDay = raw.isAllDay;
  if (typeof raw.isCancelled === "boolean") out.isCancelled = raw.isCancelled;
  return out;
}

function calendarViewBase(calendarId: string | null): string {
  return calendarId
    ? `${graphApiBase()}/v1.0/me/calendars/${encodeURIComponent(calendarId)}/calendarView`
    : `${graphApiBase()}/v1.0/me/calendarView`;
}

/**
 * Fetch up to {@link MAX_EVENTS} events from one calendar within [startIso, endIso],
 * projected to time + flags only. `calendarId === null` uses the primary calendar.
 * Throws `Unauthorized401Error` (→ refreshAndRetry) / generic `Error`; the adapter
 * classifies them.
 */
export async function fetchCalendarEvents(
  accessToken: string,
  calendarId: string | null,
  startIso: string,
  endIso: string,
): Promise<FetchedEvents> {
  const events: CalendarEventTimes[] = [];
  let truncated = false;

  const params = new URLSearchParams();
  params.set("startDateTime", startIso);
  params.set("endDateTime", endIso);
  params.set("$select", "start,end,isAllDay,isCancelled");
  params.set("$top", String(PAGE_SIZE));
  params.set("$orderby", "start/dateTime");
  let url: string = `${calendarViewBase(calendarId)}?${params.toString()}`;

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // Return start/end normalized to UTC so bucketing is timezone-stable.
        Prefer: 'outlook.timezone="UTC"',
      },
    });

    if (res.status === 401) {
      throw new Unauthorized401Error("Microsoft Graph GET me/calendarView returned HTTP 401");
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Microsoft Graph GET me/calendarView failed: ${surfaceGraphError(text, res.status)}`);
    }

    const json = (await res.json()) as RawCalendarViewResponse;
    for (const raw of json.value ?? []) {
      events.push(project(raw));
    }

    const next = json["@odata.nextLink"];
    if (!next) return { events, truncated };
    url = next;
    if (page === MAX_PAGES - 1) truncated = true; // more pages remain past the cap
  }

  return { events, truncated };
}
