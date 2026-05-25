import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";

/**
 * Wrapper for Microsoft Graph `DELETE /v1.0/me/events/{id}`.
 *
 * Used by:  delete_event action.
 *
 * Returns 204 No Content on success. The wrapper itself THROWS on
 * 404 — the action handler swallows the throw and returns
 * `{ deleted: true, alreadyMissing: true }` to make the action
 * idempotent (matches Slice 4's deleteFile convention).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404.
 *   - generic `Error` on other failures with Graph error message surfaced.
 */

export interface EventsDeleteInput {
  accessToken: string;
  eventId: string;
}

export async function eventsDelete(input: EventsDeleteInput): Promise<void> {
  const url = `${graphApiBase()}/v1.0/me/events/${encodeURIComponent(
    input.eventId,
  )}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/events/{id} DELETE returned HTTP 401",
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
      `Microsoft Graph me/events/{id} DELETE failed: ${surfaceGraphError(text, res.status)}`,
    );
  }
}
