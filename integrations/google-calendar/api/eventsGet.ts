import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { calendarApiBase } from "./_base";
import { NotFoundError } from "./errors";
import type { CalendarEventResource } from "./eventsInsert";

/**
 * Wrapper for Google Calendar `events.get`.
 *
 * Used by `addAttendees` (to fetch existing attendees for dedup) and by
 * `deleteEvent` (to capture original details for the output before
 * deletion).
 *
 * Endpoint: GET {base}/calendar/v3/calendars/{calendarId}/events/{eventId}
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (event id doesn't exist).
 *   - generic `Error` on other failures.
 */
export interface EventsGetInput {
  accessToken: string;
  calendarId: string;
  eventId: string;
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

export async function eventsGet(
  input: EventsGetInput,
): Promise<CalendarEventResource> {
  const url = `${calendarApiBase()}/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Calendar events.get returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `event ${input.eventId}`,
      surfaceErrorDetail(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Calendar events.get failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as CalendarEventResource;
}
