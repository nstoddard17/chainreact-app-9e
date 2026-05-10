import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { attachAssociations } from "../../_shared/hubspot/api/associations";
import { meetingsCreate } from "../../_shared/hubspot/api/engagements";
import { resolveTimestampMs } from "./_resolveTimestamp";
import { CreateMeetingConfigSchema } from "./createMeeting.schema";

/**
 * HubSpot `create_meeting` action handler — Slice 13 Batch 2.
 *
 * POSTs `/crm/v3/objects/meetings`. Required `hs_meeting_title`.
 * Defaults `hs_meeting_outcome` to "SCHEDULED" via schema. Optional
 * start/end times accept ISO 8601 OR epoch-ms; handler resolves both
 * to epoch-ms-string via `resolveTimestampMs`. Optional associations.
 */
export const createMeeting: ActionHandler = async (input) => {
  const config = CreateMeetingConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.accountId
      : null;

  const properties: Record<string, string> = {
    hs_meeting_title: config.hs_meeting_title,
    hs_meeting_outcome: config.hs_meeting_outcome,
    hs_timestamp:
      resolveTimestampMs(config.hs_timestamp) ?? Date.now().toString(),
  };
  if (config.hs_meeting_body) {
    properties.hs_meeting_body = config.hs_meeting_body;
  }
  const start = resolveTimestampMs(config.hs_meeting_start_time);
  if (start) properties.hs_meeting_start_time = start;
  const end = resolveTimestampMs(config.hs_meeting_end_time);
  if (end) properties.hs_meeting_end_time = end;
  if (config.hs_meeting_location) {
    properties.hs_meeting_location = config.hs_meeting_location;
  }
  if (config.hubspot_owner_id) {
    properties.hubspot_owner_id = config.hubspot_owner_id;
  }

  const meeting = await refreshAndRetry({
    userId: input.userId,
    provider: "hubspot",
    accountId,
    apiCall: (accessToken) =>
      meetingsCreate({ accessToken, properties }),
  });

  const assoc = await refreshAndRetry({
    userId: input.userId,
    provider: "hubspot",
    accountId,
    apiCall: (accessToken) =>
      attachAssociations({
        accessToken,
        fromType: "meetings",
        fromId: meeting.id,
        toIds: {
          contacts: config.associatedContactId,
          companies: config.associatedCompanyId,
          deals: config.associatedDealId,
          tickets: config.associatedTicketId,
        },
      }),
  });

  return {
    output: {
      meetingId: meeting.id,
      title: meeting.properties.hs_meeting_title ?? config.hs_meeting_title,
      outcome:
        meeting.properties.hs_meeting_outcome ?? config.hs_meeting_outcome,
      startTime: meeting.properties.hs_meeting_start_time ?? null,
      endTime: meeting.properties.hs_meeting_end_time ?? null,
      location: meeting.properties.hs_meeting_location ?? null,
      createdAt: meeting.createdAt ?? null,
      properties: meeting.properties,
      associationsAttached: assoc.attached,
      associationWarnings: assoc.warnings,
    },
  };
};
