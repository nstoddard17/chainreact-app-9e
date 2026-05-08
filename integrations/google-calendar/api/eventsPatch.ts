import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { calendarApiBase } from "./_base";
import { NotFoundError } from "./errors";
import type { CalendarEventResource } from "./eventsInsert";

/**
 * Wrapper for Google Calendar `events.patch`.
 *
 * Used by `updateEvent` and `addAttendees`. Merge-patch semantics: only
 * fields present in `body` are updated; unspecified fields are left alone.
 * Replacing the `attendees` array replaces the whole list (use
 * `addAttendees` handler if you want additive merge).
 *
 * Endpoint: PATCH {base}/calendar/v3/calendars/{calendarId}/events/{eventId}
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404.
 *   - generic `Error` on other failures.
 */
export interface EventsPatchInput {
  accessToken: string;
  calendarId: string;
  eventId: string;
  body: Record<string, unknown>;
  conferenceDataVersion?: number;
  sendUpdates?: "all" | "externalOnly" | "none";
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

export async function eventsPatch(
  input: EventsPatchInput,
): Promise<CalendarEventResource> {
  const url = new URL(
    `${calendarApiBase()}/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
  );
  if (input.conferenceDataVersion !== undefined) {
    url.searchParams.set(
      "conferenceDataVersion",
      String(input.conferenceDataVersion),
    );
  }
  if (input.sendUpdates) {
    url.searchParams.set("sendUpdates", input.sendUpdates);
  }

  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.body),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Calendar events.patch returned HTTP 401",
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
      `Google Calendar events.patch failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as CalendarEventResource;
}
