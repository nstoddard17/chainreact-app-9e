import { parseRecipients } from "@/core/integrations/parseRecipients";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { eventsGet } from "../api/eventsGet";
import { eventsPatch } from "../api/eventsPatch";
import {
  AddAttendeesConfigSchema,
  type AddAttendeesConfig,
} from "./addAttendees.schema";

/**
 * Google Calendar add_attendees action handler.
 *
 * Adds attendees to an existing event WITHOUT replacing the current ones.
 * Implementation:
 *   1. Fetch existing event (events.get) for the current attendee list.
 *   2. Parse new attendees via Q7 `parseRecipients`.
 *   3. Compute case-insensitive email diff.
 *   4. If all new emails are already invited → return early (no API call).
 *   5. Otherwise patch the event with the merged attendees array.
 *
 * For "replace all attendees" semantics, use `update_event` with
 * `attendees`.
 */
export const addAttendees: ActionHandler = async (input) => {
  const config: AddAttendeesConfig = AddAttendeesConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "google-calendar"
      ? input.triggerEvent.accountId
      : null;

  const newEmails = parseRecipients(config.attendees);
  if (newEmails.length === 0) {
    return {
      output: {
        eventId: config.eventId,
        actuallyAdded: 0,
        addedAttendees: [],
        alreadyInvited: [],
        attendees: [],
        totalAttendees: 0,
      },
    };
  }

  // Step 1: fetch the existing event.
  const existing = await refreshAndRetry({
    userId: input.userId,
    provider: "google-calendar",
    accountId,
    apiCall: (accessToken) =>
      eventsGet({
        accessToken,
        calendarId: config.calendarId,
        eventId: config.eventId,
      }),
  });

  const existingAttendees = existing.attendees ?? [];
  const existingLower = new Set(
    existingAttendees
      .map((a) => a.email?.toLowerCase())
      .filter((e): e is string => typeof e === "string" && e.length > 0),
  );

  // Step 2: compute diff.
  const toAdd: string[] = [];
  const alreadyInvited: string[] = [];
  for (const email of newEmails) {
    if (existingLower.has(email.toLowerCase())) {
      alreadyInvited.push(email);
    } else {
      toAdd.push(email);
    }
  }

  // Step 3: short-circuit if nothing new to add.
  if (toAdd.length === 0) {
    return {
      output: {
        eventId: config.eventId,
        actuallyAdded: 0,
        addedAttendees: [],
        alreadyInvited,
        attendees: existingAttendees,
        totalAttendees: existingAttendees.length,
      },
    };
  }

  // Step 4: merge and patch.
  const merged = [
    ...existingAttendees,
    ...toAdd.map((email) => ({ email })),
  ];

  const patched = await refreshAndRetry({
    userId: input.userId,
    provider: "google-calendar",
    accountId,
    apiCall: (accessToken) =>
      eventsPatch({
        accessToken,
        calendarId: config.calendarId,
        eventId: config.eventId,
        body: { attendees: merged },
        sendUpdates: config.sendNotifications,
      }),
  });

  const finalAttendees = patched.attendees ?? merged;

  return {
    output: {
      eventId: patched.id ?? config.eventId,
      actuallyAdded: toAdd.length,
      addedAttendees: toAdd,
      alreadyInvited,
      attendees: finalAttendees,
      totalAttendees: finalAttendees.length,
    },
  };
};
