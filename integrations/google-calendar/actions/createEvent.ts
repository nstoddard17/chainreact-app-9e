import { parseRecipients } from "@/core/integrations/parseRecipients";
import { resolveTimezone } from "@/core/workflows/datetime";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { eventsInsert } from "../api/eventsInsert";
import {
  CreateEventConfigSchema,
  type CreateEventConfig,
} from "./createEvent.schema";

/**
 * Google Calendar `events.insert` action handler.
 *
 * Builds a Calendar event resource from resolved config, wraps the
 * principal API call in `refreshAndRetry` (Q3), and forwards the result.
 *
 * Q-contracts respected:
 *   - Q3 401 → refreshAndRetry retries once with a fresh token.
 *   - Q7 multi-recipient attendees routed through `parseRecipients`.
 *   - Q11 sendNotifications/guestsCanInviteOthers/guestsCanSeeOtherGuests
 *         are required by the schema (no hidden defaults).
 *   - Q12 timezone resolved via `resolveTimezone` (explicit IANA → UTC).
 *
 * V1 bug fixed:
 *   - `conferenceData.requestId` is derived deterministically from
 *     `runId + nodeId` rather than V1's `Date.now()` seed. Replays
 *     produce the SAME requestId; Google's server-side dedup makes Meet
 *     creation naturally idempotent on retry.
 *
 * accountId: when the trigger fired from this same provider
 * (`google-calendar`), use its accountId; otherwise pass null and let
 * `refreshAndRetry` pick the user's single active Calendar integration.
 */
export const createEvent: ActionHandler = async (input) => {
  const config: CreateEventConfig = CreateEventConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "google-calendar"
      ? input.triggerEvent.providerAccountId
      : null;

  const attendeeEmails = parseRecipients(config.attendees ?? []);
  const tz = resolveTimezone({ explicitTz: config.timezone });

  const requestBody: Record<string, unknown> = {
    summary: config.summary,
  };
  if (config.description !== undefined) requestBody.description = config.description;
  if (config.location !== undefined) requestBody.location = config.location;
  if (config.visibility !== undefined) requestBody.visibility = config.visibility;
  if (config.transparency !== undefined) requestBody.transparency = config.transparency;
  if (config.colorId !== undefined) requestBody.colorId = config.colorId;

  if (config.allDay) {
    // Schema's superRefine guarantees both dates are present here.
    requestBody.start = { date: config.startDate! };
    requestBody.end = { date: config.endDate! };
  } else {
    requestBody.start = { dateTime: config.startDateTime!, timeZone: tz };
    requestBody.end = { dateTime: config.endDateTime!, timeZone: tz };
  }

  if (attendeeEmails.length > 0) {
    requestBody.attendees = attendeeEmails.map((email) => ({ email }));
    // Guest perms only meaningful when there are guests; Q11 still requires
    // them on the schema regardless (workflow author makes the choice).
    requestBody.guestsCanInviteOthers = config.guestsCanInviteOthers;
    requestBody.guestsCanSeeOtherGuests = config.guestsCanSeeOtherGuests;
    if (config.guestsCanModify !== undefined) {
      requestBody.guestsCanModify = config.guestsCanModify;
    }
  }

  let conferenceDataVersion: number | undefined;
  if (config.googleMeet) {
    requestBody.conferenceData = {
      createRequest: {
        // Stable per (run, node) — replays produce the same Meet link.
        requestId: `meet-${input.runId}:${input.nodeId}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
    conferenceDataVersion = 1;
  }

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "google-calendar",
    providerAccountId,
    apiCall: (accessToken) =>
      eventsInsert({
        accessToken,
        calendarId: config.calendarId,
        body: requestBody,
        conferenceDataVersion,
        sendUpdates: config.sendNotifications,
      }),
  });

  const meetLink =
    result.conferenceData?.entryPoints?.find(
      (e) => e.entryPointType === "video",
    )?.uri ?? null;

  return {
    output: {
      eventId: result.id,
      htmlLink: result.htmlLink ?? null,
      summary: result.summary ?? config.summary,
      start: result.start ?? null,
      end: result.end ?? null,
      attendees: result.attendees ?? [],
      meetLink,
      status: result.status ?? null,
    },
  };
};
