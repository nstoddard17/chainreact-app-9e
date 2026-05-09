import type { ActionHandler } from "@/services/execution/handlers/types";
import { parseRecipients } from "@/core/integrations/parseRecipients";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { GraphAttendee } from "../api/eventsCreate";
import { eventsGet } from "../api/eventsGet";
import { eventsUpdate } from "../api/eventsUpdate";
import { AddAttendeesConfigSchema } from "./addAttendees.schema";

/**
 * Outlook Calendar add_attendees action handler.
 *
 * Read-modify-write semantics:
 *   1. Schema parse + parseRecipients(attendees) → flat list. Re-check
 *      after parsing for the empty-after-CSV-trim edge case.
 *   2. GET /v1.0/me/events/{id} via refreshAndRetry to read existing
 *      attendees. NotFoundError propagates (workflow author should
 *      see "event not found" rather than a phantom success).
 *   3. Merge: keep existing attendees as-is; append parsed addresses
 *      that aren't already in the list. Dedupe by email address
 *      case-insensitively.
 *   4. PATCH /v1.0/me/events/{id} with the merged attendee list. Both
 *      the original GET token and the PATCH token live behind
 *      `refreshAndRetry`, so a 401 mid-sequence re-fetches and
 *      retries each call individually.
 *
 * Race window: between GET and PATCH another client could mutate the
 * attendee list and we'd overwrite their changes. Slice 7 accepts
 * this (single-actor assumption — documented in plan doc §"Risk
 * callouts" #7). Optimistic concurrency via Graph's `If-Match` ETags
 * is a follow-up.
 *
 * Output:
 *   { id, attendeesAdded: ["alice@x", ...], attendeesTotal: N,
 *     attendeesAlreadyPresent: [...] }
 */
export const addAttendees: ActionHandler = async (input) => {
  const config = AddAttendeesConfigSchema.parse(input.config);

  // Q7 — parseRecipients flattens CSV / arrays / empties.
  const requestedAddresses = parseRecipients(config.attendees);
  if (requestedAddresses.length === 0) {
    throw new Error(
      "add_attendees: at least one address in `attendees` is required (after parsing CSV / array).",
    );
  }

  const accountId =
    input.triggerEvent.provider === "microsoft-outlook-calendar"
      ? input.triggerEvent.accountId
      : null;

  // 1. GET the current event so we can preserve existing attendees.
  const existingEvent = await refreshAndRetry({
    userId: input.userId,
    provider: "microsoft-outlook-calendar",
    accountId,
    apiCall: (accessToken) =>
      eventsGet({ accessToken, eventId: config.eventId }),
  });

  const existingAttendees = existingEvent.attendees ?? [];
  const existingAddressesLower = new Set(
    existingAttendees
      .map((a) => a.emailAddress.address?.toLowerCase())
      .filter((s): s is string => Boolean(s)),
  );

  // 2. Build the new-attendees list — dedupe against existing.
  const attendeesAdded: string[] = [];
  const attendeesAlreadyPresent: string[] = [];
  const newGraphAttendees: GraphAttendee[] = [];
  for (const address of requestedAddresses) {
    if (existingAddressesLower.has(address.toLowerCase())) {
      attendeesAlreadyPresent.push(address);
      continue;
    }
    attendeesAdded.push(address);
    newGraphAttendees.push({
      emailAddress: { address },
      type: config.attendeeType,
    });
  }

  // 3. If everyone's already there, skip the PATCH (no-op + cheaper).
  if (newGraphAttendees.length === 0) {
    return {
      output: {
        id: existingEvent.id,
        attendeesAdded: [] as string[],
        attendeesTotal: existingAttendees.length,
        attendeesAlreadyPresent,
      },
    };
  }

  // 4. PATCH with merged list (existing + new).
  const mergedAttendees = [...existingAttendees, ...newGraphAttendees];
  const updatedEvent = await refreshAndRetry({
    userId: input.userId,
    provider: "microsoft-outlook-calendar",
    accountId,
    apiCall: (accessToken) =>
      eventsUpdate({
        accessToken,
        eventId: config.eventId,
        body: { attendees: mergedAttendees },
      }),
  });

  return {
    output: {
      id: updatedEvent.id,
      attendeesAdded,
      attendeesTotal: (updatedEvent.attendees ?? mergedAttendees).length,
      attendeesAlreadyPresent,
    },
  };
};
