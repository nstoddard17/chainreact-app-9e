import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";

/**
 * Wrapper for Microsoft Graph `POST /v1.0/me/events`.
 *
 * Used by:  create_event action.
 *
 * Takes a Graph-shaped event body verbatim. The handler is responsible
 * for assembling `start: {dateTime, timeZone}`, `body: {contentType,
 * content}`, `attendees: [{emailAddress: {address}, type}]`, etc. The
 * wrapper just POSTs.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - generic `Error` on other failures with the Graph error message
 *     surfaced (e.g., "ErrorInvalidRecipients", "ErrorInvalidArgument").
 */

export interface GraphDateTimeTimeZone {
  /** ISO-8601 datetime string, e.g. "2026-05-15T14:30:00". */
  dateTime: string;
  /** IANA timezone name. Required by Graph for non-all-day events. */
  timeZone: string;
}

export interface GraphMessageBody {
  contentType: "Text" | "HTML";
  content: string;
}

export interface GraphLocation {
  displayName: string;
}

export interface GraphAttendee {
  emailAddress: { name?: string; address: string };
  type: "required" | "optional" | "resource";
  status?: { response?: string; time?: string };
}

export interface GraphRecipientAddress {
  emailAddress: { name?: string; address?: string };
}

/** Subset of the Graph Event resource we read in responses + send in create/update. */
export interface GraphEvent {
  id: string;
  subject?: string;
  bodyPreview?: string;
  body?: GraphMessageBody;
  start?: GraphDateTimeTimeZone;
  end?: GraphDateTimeTimeZone;
  isAllDay?: boolean;
  location?: GraphLocation;
  attendees?: GraphAttendee[];
  organizer?: GraphRecipientAddress;
  isOnlineMeeting?: boolean;
  onlineMeeting?: { joinUrl?: string };
  importance?: "low" | "normal" | "high";
  sensitivity?: "normal" | "personal" | "private" | "confidential";
  showAs?: "free" | "tentative" | "busy" | "oof" | "workingElsewhere";
  responseRequested?: boolean;
  reminderMinutesBeforeStart?: number;
  webLink?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  conversationId?: string;
}

/**
 * Graph event create body. Only fields the handler needs to send;
 * Graph fills in defaults for omitted fields server-side.
 */
export interface GraphEventCreateBody {
  subject: string;
  start: GraphDateTimeTimeZone;
  end: GraphDateTimeTimeZone;
  isAllDay: boolean;
  responseRequested: boolean;
  body?: GraphMessageBody;
  location?: GraphLocation;
  attendees?: GraphAttendee[];
  reminderMinutesBeforeStart?: number;
  showAs?: "free" | "tentative" | "busy" | "oof" | "workingElsewhere";
  sensitivity?: "normal" | "personal" | "private" | "confidential";
  importance?: "low" | "normal" | "high";
}

export interface EventsCreateInput {
  accessToken: string;
  body: GraphEventCreateBody;
}

export async function eventsCreate(
  input: EventsCreateInput,
): Promise<GraphEvent> {
  const url = `${graphApiBase()}/v1.0/me/events`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.body),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/events POST returned HTTP 401",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/events POST failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as GraphEvent;
}
