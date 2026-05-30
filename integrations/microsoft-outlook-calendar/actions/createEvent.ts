import type { ActionHandler } from "@/services/execution/handlers/types";
import { parseRecipients } from "@/core/integrations/parseRecipients";
import { resolveTimezone } from "@/core/workflows/datetime";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  eventsCreate,
  type GraphAttendee,
  type GraphEventCreateBody,
} from "../api/eventsCreate";
import { CreateEventConfigSchema } from "./createEvent.schema";

/**
 * Outlook Calendar `me/events` create action handler.
 *
 * Algorithm:
 *   1. Schema parse (Zod strict, Q11 enforces explicit isAllDay +
 *      responseRequested + bodyContentType-when-body-present).
 *   2. parseRecipients(attendees) → flat list of addresses (Q7).
 *      Each becomes `{emailAddress: {address}, type: "required"}`.
 *      Slice 7 hardcodes "required" type at create — `add_attendees`
 *      is the action that exposes Q11 attendeeType.
 *   3. Resolve start.timeZone + end.timeZone via resolveTimezone (Q12 —
 *      explicit-or-UTC; V1's `Intl.DateTimeFormat()` server-tz default
 *      is the rot we fix).
 *   4. Build the Graph payload — only include optional fields that
 *      were actually provided.
 *   5. POST /v1.0/me/events via refreshAndRetry.
 *
 * Output shape (downstream variable refs):
 *   { id, subject, start, end, webLink, isAllDay, organizer,
 *     attendees: [{name, address, type, status}] }
 */
export const createEvent: ActionHandler = async (input) => {
  const config = CreateEventConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-outlook-calendar"
      ? input.triggerEvent.providerAccountId
      : null;

  // Q12 — resolve timezones (explicit-or-UTC). The helper validates
  // IANA names against Intl.DateTimeFormat; invalid names fall back
  // to UTC silently — matches the helper's documented behavior.
  const startTimeZone = resolveTimezone({
    explicitTz: config.start.timeZone,
  });
  const endTimeZone = resolveTimezone({ explicitTz: config.end.timeZone });

  // Q7 — parseRecipients flattens CSV / arrays / empties.
  const attendeeAddresses = parseRecipients(config.attendees);
  const graphAttendees: GraphAttendee[] = attendeeAddresses.map((address) => ({
    emailAddress: { address },
    type: "required",
  }));

  // Build the Graph payload — start with the required fields, then
  // selectively add optionals so Graph receives "absent" rather than
  // "explicit null" for unspecified knobs.
  const body: GraphEventCreateBody = {
    subject: config.subject,
    start: { dateTime: config.start.dateTime, timeZone: startTimeZone },
    end: { dateTime: config.end.dateTime, timeZone: endTimeZone },
    isAllDay: config.isAllDay,
    responseRequested: config.responseRequested,
  };
  if (config.body) {
    // Schema's refine guarantees bodyContentType is set when body is
    // non-empty — narrow the optional safely.
    body.body = {
      contentType: config.bodyContentType!,
      content: config.body,
    };
  }
  if (config.location) {
    body.location = { displayName: config.location };
  }
  if (graphAttendees.length > 0) {
    body.attendees = graphAttendees;
  }
  if (config.reminderMinutesBeforeStart !== undefined) {
    body.reminderMinutesBeforeStart = config.reminderMinutesBeforeStart;
  }
  if (config.showAs !== undefined) body.showAs = config.showAs;
  if (config.sensitivity !== undefined) body.sensitivity = config.sensitivity;
  if (config.importance !== undefined) body.importance = config.importance;

  const event = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-outlook-calendar",
    providerAccountId,
    apiCall: (accessToken) => eventsCreate({ accessToken, body }),
  });

  return {
    output: {
      id: event.id,
      subject: event.subject ?? config.subject,
      start: event.start ?? body.start,
      end: event.end ?? body.end,
      isAllDay: event.isAllDay ?? config.isAllDay,
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
