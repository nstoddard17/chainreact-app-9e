import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import type { GraphEvent } from "./eventsCreate";

/**
 * Wrapper for Microsoft Graph `GET /v1.0/me/events/{id}`.
 *
 * Used by:
 *   - `add_attendees` action — read-modify-write to merge attendees
 *     without losing the existing list (Graph PATCH replaces).
 *   - `event_changed` trigger receiver (Slice 7 Commit 4) — fetches
 *     the full event resource at notification time, since the Graph
 *     notification envelope only contains the event id.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (event deleted between caller's
 *     prior interaction and the GET; `add_attendees` propagates,
 *     trigger receiver swallows + emits a minimal payload).
 *   - generic `Error` on other failures with Graph error message surfaced.
 */

export interface EventsGetInput {
  accessToken: string;
  /** Graph event id (URL-safe; Graph already URL-encodes safe chars). */
  eventId: string;
}

export async function eventsGet(input: EventsGetInput): Promise<GraphEvent> {
  const url = `${graphApiBase()}/v1.0/me/events/${encodeURIComponent(
    input.eventId,
  )}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/events/{id} GET returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `event ${input.eventId}`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/events/{id} GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as GraphEvent;
}
