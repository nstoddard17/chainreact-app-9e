import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { ticketsUpdate } from "../../_shared/hubspot/api/tickets";
import { UpdateTicketConfigSchema } from "./updateTicket.schema";

const UPDATABLE_FIELDS = [
  "subject",
  "content",
  "hs_pipeline",
  "hs_pipeline_stage",
  "hs_ticket_priority",
  "hs_ticket_category",
  "source_type",
  "hubspot_owner_id",
] as const;

/**
 * HubSpot `update_ticket` action handler — Slice 13 Batch 2.
 *
 * PATCHes `/crm/v3/objects/tickets/{id}` with the supplied non-empty
 * property fields. Throws if no property fields are provided.
 */
export const updateTicket: ActionHandler = async (input) => {
  const config = UpdateTicketConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.providerAccountId
      : null;

  const properties: Record<string, string> = {};
  for (const k of UPDATABLE_FIELDS) {
    const v = config[k];
    if (typeof v === "string" && v.length > 0) {
      properties[k] = v;
    }
  }
  if (Object.keys(properties).length === 0) {
    throw new Error(
      "hubspot update_ticket: at least one property field must be provided.",
    );
  }

  const ticket = await refreshAndRetry({
    accountId: input.accountId,
    provider: "hubspot",
    providerAccountId,
    apiCall: (accessToken) =>
      ticketsUpdate({
        accessToken,
        ticketId: config.ticketId,
        properties,
      }),
  });

  return {
    output: {
      ticketId: ticket.id,
      subject: ticket.properties.subject ?? null,
      pipeline: ticket.properties.hs_pipeline ?? null,
      pipelineStage: ticket.properties.hs_pipeline_stage ?? null,
      updatedAt: ticket.updatedAt ?? null,
      properties: ticket.properties,
    },
  };
};
