import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { calendarApiBase } from "./_base";
import { NotFoundError } from "./errors";

/**
 * Wrapper for Google Calendar `events.delete`.
 *
 * Endpoint: DELETE {base}/calendar/v3/calendars/{calendarId}/events/{eventId}
 *           ?sendUpdates=all|externalOnly|none
 * Returns: 204 No Content on success (no JSON body).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (event already deleted or never existed).
 *   - generic `Error` on other failures.
 */
export interface EventsDeleteInput {
  accessToken: string;
  calendarId: string;
  eventId: string;
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

export async function eventsDelete(input: EventsDeleteInput): Promise<void> {
  const url = new URL(
    `${calendarApiBase()}/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
  );
  if (input.sendUpdates) {
    url.searchParams.set("sendUpdates", input.sendUpdates);
  }

  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Calendar events.delete returned HTTP 401",
    );
  }
  if (res.status === 404 || res.status === 410) {
    // 410 Gone is what Google returns when the event was already deleted
    // and the resource is genuinely gone. Treat both as NotFound.
    const text = await res.text();
    throw new NotFoundError(
      `event ${input.eventId}`,
      surfaceErrorDetail(text, res.status),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Calendar events.delete failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  // 204 No Content — no body to parse.
}
