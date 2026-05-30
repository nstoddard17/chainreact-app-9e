import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { attachAssociations } from "../../_shared/hubspot/api/associations";
import { callsCreate } from "../../_shared/hubspot/api/engagements";
import { resolveTimestampMs } from "./_resolveTimestamp";
import { CreateCallConfigSchema } from "./createCall.schema";

/**
 * HubSpot `create_call` action handler — Slice 13 Batch 2.
 *
 * POSTs `/crm/v3/objects/calls`. Defaults `hs_call_status` to
 * "COMPLETED" via schema and `hs_timestamp` to `Date.now()` when
 * omitted. Optional associations.
 */
export const createCall: ActionHandler = async (input) => {
  const config = CreateCallConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.providerAccountId
      : null;

  const properties: Record<string, string> = {
    hs_call_status: config.hs_call_status,
    hs_timestamp: resolveTimestampMs(config.hs_timestamp) ?? Date.now().toString(),
  };
  if (config.hs_call_title) properties.hs_call_title = config.hs_call_title;
  if (config.hs_call_body) properties.hs_call_body = config.hs_call_body;
  if (config.hs_call_duration) {
    properties.hs_call_duration = config.hs_call_duration;
  }
  if (config.hs_call_direction) {
    properties.hs_call_direction = config.hs_call_direction;
  }
  if (config.hs_call_disposition) {
    properties.hs_call_disposition = config.hs_call_disposition;
  }
  if (config.hubspot_owner_id) {
    properties.hubspot_owner_id = config.hubspot_owner_id;
  }

  const call = await refreshAndRetry({
    accountId: input.accountId,
    provider: "hubspot",
    providerAccountId,
    apiCall: (accessToken) =>
      callsCreate({ accessToken, properties }),
  });

  const assoc = await refreshAndRetry({
    accountId: input.accountId,
    provider: "hubspot",
    providerAccountId,
    apiCall: (accessToken) =>
      attachAssociations({
        accessToken,
        fromType: "calls",
        fromId: call.id,
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
      callId: call.id,
      title: call.properties.hs_call_title ?? null,
      status: call.properties.hs_call_status ?? config.hs_call_status,
      duration: call.properties.hs_call_duration ?? null,
      direction: call.properties.hs_call_direction ?? null,
      createdAt: call.createdAt ?? null,
      properties: call.properties,
      associationsAttached: assoc.attached,
      associationWarnings: assoc.warnings,
    },
  };
};
