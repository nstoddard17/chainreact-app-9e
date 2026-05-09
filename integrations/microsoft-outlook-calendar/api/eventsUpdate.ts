import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import type {
  GraphAttendee,
  GraphDateTimeTimeZone,
  GraphEvent,
  GraphLocation,
  GraphMessageBody,
} from "./eventsCreate";

/**
 * Wrapper for Microsoft Graph `PATCH /v1.0/me/events/{id}`.
 *
 * Used by:
 *   - `update_event` action — partial update; provided fields REPLACE
 *     the corresponding event fields. Omitted fields stay unchanged.
 *   - `add_attendees` action — read-modify-write; passes the merged
 *     attendee list as the only patched field.
 *
 * **Important Graph semantic:** PATCH on `attendees` REPLACES the
 * entire list. The `update_event` schema docs explain this; the
 * `add_attendees` action exists specifically because of it.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (event already gone).
 *   - generic `Error` on other failures with Graph error message surfaced.
 */

/** Subset of GraphEvent fields the update wrapper accepts as a patch body. */
export interface GraphEventPatchBody {
  subject?: string;
  start?: GraphDateTimeTimeZone;
  end?: GraphDateTimeTimeZone;
  isAllDay?: boolean;
  responseRequested?: boolean;
  body?: GraphMessageBody;
  location?: GraphLocation;
  /**
   * Replaces the full attendee list — Graph has no native "append" mode.
   * The `add_attendees` action does GET → merge → PATCH to preserve
   * existing attendees.
   */
  attendees?: GraphAttendee[];
  reminderMinutesBeforeStart?: number;
  showAs?: "free" | "tentative" | "busy" | "oof" | "workingElsewhere";
  sensitivity?: "normal" | "personal" | "private" | "confidential";
  importance?: "low" | "normal" | "high";
}

export interface EventsUpdateInput {
  accessToken: string;
  eventId: string;
  body: GraphEventPatchBody;
}

export async function eventsUpdate(
  input: EventsUpdateInput,
): Promise<GraphEvent> {
  const url = `${graphApiBase()}/v1.0/me/events/${encodeURIComponent(
    input.eventId,
  )}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.body),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/events/{id} PATCH returned HTTP 401",
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
      `Microsoft Graph me/events/{id} PATCH failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as GraphEvent;
}
