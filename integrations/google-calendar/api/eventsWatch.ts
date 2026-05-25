import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { calendarApiBase } from "./_base";
import { NotFoundError } from "./errors";

/**
 * Wrapper for Google Calendar `events.watch`.
 *
 * Endpoint: POST {base}/calendar/v3/calendars/{calendarId}/events/watch
 * Body:     application/json — { id, type: "web_hook", address, token }
 * Response: { kind, id, resourceId, resourceUri, expiration }
 *
 * `expiration` is milliseconds since epoch as a string. The activation /
 * renewal callers convert it to ISO 8601 before persisting.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (calendar id doesn't exist).
 *   - generic `Error` on other failures.
 */
export interface EventsWatchInput {
  accessToken: string;
  calendarId: string;
  /** Channel id we generated (matches what Google echoes via X-Goog-Channel-Id). */
  channelId: string;
  /** HMAC token Google echoes via X-Goog-Channel-Token at every notification. */
  channelToken: string;
  /** Public webhook URL Google POSTs notifications to. */
  webhookAddress: string;
  /**
   * Optional TTL in seconds. Calendar's max is 7 days. Omit to use Google's
   * default (also 7 days for Calendar).
   */
  ttlSeconds?: number;
}

export interface WatchResource {
  kind?: string;
  id: string;
  resourceId: string;
  resourceUri?: string;
  /** Milliseconds since epoch as a string. */
  expiration: string;
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

export async function eventsWatch(
  input: EventsWatchInput,
): Promise<WatchResource> {
  const url = `${calendarApiBase()}/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/watch`;
  const body: Record<string, unknown> = {
    id: input.channelId,
    type: "web_hook",
    address: input.webhookAddress,
    token: input.channelToken,
  };
  if (input.ttlSeconds !== undefined) {
    body.params = { ttl: String(input.ttlSeconds) };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Calendar events.watch returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `calendar ${input.calendarId}`,
      surfaceErrorDetail(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Calendar events.watch failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as WatchResource;
}
