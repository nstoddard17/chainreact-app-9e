import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";
import type { GraphEvent } from "./eventsCreate";

/**
 * Wrapper for Microsoft Graph event list endpoints.
 *
 * Used by:  list_events action.
 *
 * Two endpoints, picked by the handler based on whether a date range
 * was supplied:
 *   - `/me/calendarView?startDateTime=…&endDateTime=…` — auto-EXPANDS
 *     recurring events into individual occurrences. Used when both
 *     startDate AND endDate are provided. orderBy "start" maps to
 *     `start/dateTime`.
 *   - `/me/events` — returns master events for recurring series (one
 *     row per series). Used when no date range. orderBy "start" maps
 *     to `createdDateTime` (events endpoint doesn't expose start as
 *     an orderable field).
 *
 * The wrapper picks the path based on which timestamps are supplied;
 * the handler's schema enforces the both-or-neither invariant via a
 * Zod refine.
 *
 * `$select` is fixed to a bounded field set so the response payload
 * stays predictable regardless of how many fields the underlying
 * event has.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - generic `Error` on other failures with Graph error message surfaced.
 */

const SELECT_FIELDS = [
  "id",
  "subject",
  "bodyPreview",
  "start",
  "end",
  "isAllDay",
  "location",
  "attendees",
  "organizer",
  "isOnlineMeeting",
  "onlineMeeting",
  "importance",
  "sensitivity",
  "showAs",
  "responseRequested",
  "webLink",
  "createdDateTime",
  "lastModifiedDateTime",
].join(",");

export interface EventsListInput {
  accessToken: string;
  /**
   * When both supplied, the wrapper hits /me/calendarView (auto-expands
   * recurrences). When neither, hits /me/events (master events only).
   * Schema enforces both-or-neither.
   */
  startDateTime?: string;
  endDateTime?: string;
  top: number;
  orderBy: "start" | "subject";
  /** Optional substring filter on subject — built into a Graph $filter clause. */
  subjectFilter?: string;
}

export interface EventsListResult {
  events: GraphEvent[];
  /**
   * `@odata.nextLink` from Graph when the response is paginated.
   * Slice 7 returns up to `top` events and surfaces this for forward-
   * compat; the handler doesn't auto-paginate.
   */
  nextLink: string | null;
}

interface RawEventsListResponse {
  value?: GraphEvent[];
  "@odata.nextLink"?: string;
}

export async function eventsList(
  input: EventsListInput,
): Promise<EventsListResult> {
  const usingCalendarView =
    input.startDateTime !== undefined && input.endDateTime !== undefined;

  const url = new URL(
    usingCalendarView
      ? `${graphApiBase()}/v1.0/me/calendarView`
      : `${graphApiBase()}/v1.0/me/events`,
  );
  url.searchParams.set("$select", SELECT_FIELDS);
  url.searchParams.set("$top", String(input.top));

  if (usingCalendarView) {
    url.searchParams.set("startDateTime", input.startDateTime!);
    url.searchParams.set("endDateTime", input.endDateTime!);
    // calendarView orderable fields — "start/dateTime" is the canonical
    // chronological sort.
    url.searchParams.set(
      "$orderby",
      input.orderBy === "start" ? "start/dateTime" : "subject",
    );
  } else {
    // /me/events doesn't expose `start` as an orderable field; map
    // "start" → "createdDateTime desc" so callers asking for "newest
    // first" get the most-recently-created events.
    url.searchParams.set(
      "$orderby",
      input.orderBy === "start" ? "createdDateTime desc" : "subject",
    );
  }

  if (input.subjectFilter) {
    // Graph OData $filter — escape single quotes by doubling them.
    const escaped = input.subjectFilter.replace(/'/g, "''");
    url.searchParams.set("$filter", `contains(subject, '${escaped}')`);
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/events GET returned HTTP 401",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/events GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  const json = (await res.json()) as RawEventsListResponse;
  return {
    events: json.value ?? [],
    nextLink: json["@odata.nextLink"] ?? null,
  };
}
