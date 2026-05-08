import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { calendarApiBase } from "./_base";
import { NotFoundError } from "./errors";
import type { CalendarEventResource } from "./eventsInsert";

/**
 * Wrapper for Google Calendar `events.list`.
 *
 * Endpoint: GET {base}/calendar/v3/calendars/{calendarId}/events
 * Read-only; no Q4 idempotency or sendUpdates concern.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (calendar id doesn't exist).
 *   - generic `Error` on other failures.
 */
export interface EventsListInput {
  accessToken: string;
  calendarId: string;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  q?: string;
  orderBy?: "startTime" | "updated";
  singleEvents?: boolean;
  showDeleted?: boolean;
  pageToken?: string;
}

export interface EventsListResult {
  kind?: string;
  summary?: string;
  timeZone?: string;
  items?: ReadonlyArray<CalendarEventResource>;
  nextPageToken?: string;
  nextSyncToken?: string;
  [k: string]: unknown;
}

interface CalendarErrorPayload {
  error?: { code?: number; message?: string; status?: string };
}

function surfaceErrorDetail(text: string, status: number): string {
  let detail = `HTTP ${status}`;
  try {
    const parsed = JSON.parse(text) as CalendarErrorPayload;
    if (parsed?.error?.message) detail = parsed.error.message;
    else if (parsed?.error?.status) detail = parsed.error.status;
  } catch {
    // not JSON
  }
  return detail;
}

export async function eventsList(
  input: EventsListInput,
): Promise<EventsListResult> {
  const url = new URL(
    `${calendarApiBase()}/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events`,
  );
  if (input.timeMin) url.searchParams.set("timeMin", input.timeMin);
  if (input.timeMax) url.searchParams.set("timeMax", input.timeMax);
  if (input.maxResults !== undefined) {
    url.searchParams.set("maxResults", String(input.maxResults));
  }
  if (input.q) url.searchParams.set("q", input.q);
  if (input.orderBy) url.searchParams.set("orderBy", input.orderBy);
  if (input.singleEvents !== undefined) {
    url.searchParams.set("singleEvents", String(input.singleEvents));
  }
  if (input.showDeleted !== undefined) {
    url.searchParams.set("showDeleted", String(input.showDeleted));
  }
  if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Calendar events.list returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError("calendar", surfaceErrorDetail(text, 404));
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Calendar events.list failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as EventsListResult;
}
