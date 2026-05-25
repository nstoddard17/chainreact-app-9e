import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { calendarApiBase } from "./_base";
import { NotFoundError } from "./errors";

/**
 * Wrapper for Google Calendar `events.insert`.
 *
 * Endpoint: POST {base}/calendar/v3/calendars/{calendarId}/events
 * Query:    `conferenceDataVersion=1` when creating a Google Meet,
 *           `sendUpdates=all|externalOnly|none` for invitation notifications.
 * Body:     application/json — full Calendar event resource.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401 (refreshAndRetry contract).
 *   - `NotFoundError` on HTTP 404 (calendar id doesn't exist or no access).
 *   - generic `Error` with surfaced Google error.message on other 4xx/5xx.
 */
export interface EventsInsertInput {
  accessToken: string;
  calendarId: string;
  body: Record<string, unknown>;
  conferenceDataVersion?: number;
  sendUpdates?: "all" | "externalOnly" | "none";
}

export interface CalendarEventResource {
  id: string;
  htmlLink?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: Record<string, unknown>;
  end?: Record<string, unknown>;
  attendees?: ReadonlyArray<{ email?: string; responseStatus?: string }>;
  status?: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: ReadonlyArray<{ entryPointType?: string; uri?: string }>;
  };
  updated?: string;
  [k: string]: unknown;
}

interface CalendarErrorPayload {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

function surfaceErrorDetail(text: string, status: number): string {
  let detail = `HTTP ${status}`;
  try {
    const parsed = JSON.parse(text) as CalendarErrorPayload;
    if (parsed?.error?.message) detail = parsed.error.message;
    else if (parsed?.error?.status) detail = parsed.error.status;
  } catch {
    // not JSON — keep HTTP status
  }
  return detail;
}

export async function eventsInsert(
  input: EventsInsertInput,
): Promise<CalendarEventResource> {
  const url = new URL(
    `${calendarApiBase()}/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events`,
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
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.body),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Calendar events.insert returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError("calendar", surfaceErrorDetail(text, 404));
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Calendar events.insert failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as CalendarEventResource;
}
