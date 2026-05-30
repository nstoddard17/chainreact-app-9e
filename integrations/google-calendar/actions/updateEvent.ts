import { parseRecipients } from "@/core/integrations/parseRecipients";
import { resolveTimezone } from "@/core/workflows/datetime";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { eventsPatch } from "../api/eventsPatch";
import {
  UpdateEventConfigSchema,
  type UpdateEventConfig,
} from "./updateEvent.schema";

/**
 * Google Calendar `events.patch` action handler (update flow).
 *
 * Sends a JSON merge patch — only fields present in `config` are
 * forwarded to Google. Anything omitted stays untouched on the existing
 * event.
 *
 * V1 bugs fixed:
 *   - No `'09:00'` synthetic fallback. Time edits require BOTH
 *     `startDateTime` and `endDateTime`; the schema's superRefine fails
 *     fast if only one is supplied.
 *   - `googleMeet` is a boolean (V1 had a mixed boolean/object shape on
 *     update vs create — V2 aligns both on boolean).
 *   - Stable `conferenceData.requestId = "meet-{runId}:{nodeId}"`.
 *
 * Q-contracts: Q3 (refreshAndRetry), Q7 (parseRecipients for attendees),
 * Q11 (sendNotifications required), Q12 (resolveTimezone for timezone).
 *
 * Replacing attendees: providing `attendees` in the patch REPLACES the
 * existing list. For additive merge, use the `add_attendees` handler.
 */
export const updateEvent: ActionHandler = async (input) => {
  const config: UpdateEventConfig = UpdateEventConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "google-calendar"
      ? input.triggerEvent.providerAccountId
      : null;

  const patch: Record<string, unknown> = {};

  if (config.summary !== undefined) patch.summary = config.summary;
  if (config.description !== undefined) patch.description = config.description;
  if (config.location !== undefined) patch.location = config.location;
  if (config.visibility !== undefined) patch.visibility = config.visibility;
  if (config.transparency !== undefined) patch.transparency = config.transparency;
  if (config.colorId !== undefined) patch.colorId = config.colorId;

  if (config.startDateTime !== undefined && config.endDateTime !== undefined) {
    const tz = resolveTimezone({ explicitTz: config.timezone });
    patch.start = { dateTime: config.startDateTime, timeZone: tz };
    patch.end = { dateTime: config.endDateTime, timeZone: tz };
  }

  if (config.attendees !== undefined) {
    const emails = parseRecipients(config.attendees);
    patch.attendees = emails.map((email) => ({ email }));
  }

  if (config.guestsCanInviteOthers !== undefined) {
    patch.guestsCanInviteOthers = config.guestsCanInviteOthers;
  }
  if (config.guestsCanSeeOtherGuests !== undefined) {
    patch.guestsCanSeeOtherGuests = config.guestsCanSeeOtherGuests;
  }
  if (config.guestsCanModify !== undefined) {
    patch.guestsCanModify = config.guestsCanModify;
  }

  let conferenceDataVersion: number | undefined;
  if (config.googleMeet === true) {
    patch.conferenceData = {
      createRequest: {
        requestId: `meet-${input.runId}:${input.nodeId}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
    conferenceDataVersion = 1;
  }
  // googleMeet === false is a no-op for now: removing an existing
  // conference via patch is out of scope for Batch 1.

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "google-calendar",
    providerAccountId,
    apiCall: (accessToken) =>
      eventsPatch({
        accessToken,
        calendarId: config.calendarId,
        eventId: config.eventId,
        body: patch,
        conferenceDataVersion,
        sendUpdates: config.sendNotifications,
      }),
  });

  return {
    output: {
      eventId: result.id,
      htmlLink: result.htmlLink ?? null,
      summary: result.summary ?? null,
      description: result.description ?? null,
      location: result.location ?? null,
      start: result.start ?? null,
      end: result.end ?? null,
      attendees: result.attendees ?? [],
      status: result.status ?? null,
      updated: result.updated ?? null,
    },
  };
};
