import type { ActionHandler } from "@/services/execution/handlers/types";
import { parseRecipients } from "@/core/integrations/parseRecipients";
import { resolveTimezone } from "@/core/workflows/datetime";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { eventsUpdate, type GraphEventPatchBody } from "../api/eventsUpdate";
import type { GraphAttendee } from "../api/eventsCreate";
import { UpdateEventConfigSchema } from "./updateEvent.schema";

/**
 * Outlook Calendar update_event action handler.
 *
 * PATCH semantics — only fields explicitly provided are sent. Graph
 * leaves omitted fields unchanged.
 *
 * Attendees REPLACEMENT warning: when `attendees` is in the PATCH,
 * Graph REPLACES the existing attendee list. Workflow authors who want
 * to APPEND should use the `add_attendees` action.
 *
 * Output shape mirrors create_event so downstream nodes can branch on
 * the same fields regardless of which action produced the event:
 *   { id, subject, start, end, isAllDay, webLink, organizer, attendees }
 */
export const updateEvent: ActionHandler = async (input) => {
  const config = UpdateEventConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "microsoft-outlook-calendar"
      ? input.triggerEvent.accountId
      : null;

  // Build PATCH body — only set fields the caller actually provided.
  const body: GraphEventPatchBody = {};
  if (config.subject !== undefined) body.subject = config.subject;
  if (config.start !== undefined) {
    body.start = {
      dateTime: config.start.dateTime,
      timeZone: resolveTimezone({ explicitTz: config.start.timeZone }),
    };
  }
  if (config.end !== undefined) {
    body.end = {
      dateTime: config.end.dateTime,
      timeZone: resolveTimezone({ explicitTz: config.end.timeZone }),
    };
  }
  if (config.isAllDay !== undefined) body.isAllDay = config.isAllDay;
  if (config.responseRequested !== undefined) {
    body.responseRequested = config.responseRequested;
  }
  if (config.body !== undefined) {
    // Schema's refine guarantees bodyContentType is set when body is
    // present (truthy). Narrow safely.
    body.body = {
      contentType: config.bodyContentType ?? "Text",
      content: config.body,
    };
  }
  if (config.location !== undefined) {
    body.location = { displayName: config.location };
  }
  if (config.attendees !== undefined) {
    const addresses = parseRecipients(config.attendees);
    const attendees: GraphAttendee[] = addresses.map((address) => ({
      emailAddress: { address },
      type: "required",
    }));
    body.attendees = attendees;
  }
  if (config.reminderMinutesBeforeStart !== undefined) {
    body.reminderMinutesBeforeStart = config.reminderMinutesBeforeStart;
  }
  if (config.showAs !== undefined) body.showAs = config.showAs;
  if (config.sensitivity !== undefined) body.sensitivity = config.sensitivity;
  if (config.importance !== undefined) body.importance = config.importance;

  const event = await refreshAndRetry({
    userId: input.userId,
    provider: "microsoft-outlook-calendar",
    accountId,
    apiCall: (accessToken) =>
      eventsUpdate({ accessToken, eventId: config.eventId, body }),
  });

  return {
    output: {
      id: event.id,
      subject: event.subject ?? null,
      start: event.start ?? null,
      end: event.end ?? null,
      isAllDay: event.isAllDay ?? false,
      webLink: event.webLink ?? null,
      organizer: event.organizer
        ? {
            name: event.organizer.emailAddress?.name ?? "",
            address: event.organizer.emailAddress?.address ?? "",
          }
        : null,
      attendees: (event.attendees ?? []).map((a) => ({
        name: a.emailAddress.name ?? "",
        address: a.emailAddress.address,
        type: a.type,
        status: a.status?.response ?? null,
      })),
    },
  };
};
