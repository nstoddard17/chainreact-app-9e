import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { attachAssociations } from "../../_shared/hubspot/api/associations";
import { ticketsCreate } from "../../_shared/hubspot/api/tickets";
import { CreateTicketConfigSchema } from "./createTicket.schema";

const OPTIONAL_PROPERTY_FIELDS = [
  "content",
  "hs_ticket_priority",
  "hs_ticket_category",
  "source_type",
  "hubspot_owner_id",
] as const;

/**
 * HubSpot `create_ticket` action handler — Slice 13 Batch 2.
 *
 * POSTs `/crm/v3/objects/tickets`. Then issues parallel v4 default-
 * typed association PUTs for any supplied `associatedContactId` /
 * `associatedCompanyId` / `associatedDealId`. Failed associations
 * surface as `associationWarnings` in the output — the ticket itself
 * is the load-bearing artifact and isn't rolled back.
 *
 * Attachments deferred — separate slice with file-storage abstraction.
 */
export const createTicket: ActionHandler = async (input) => {
  const config = CreateTicketConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.providerAccountId
      : null;

  const properties: Record<string, string> = {
    subject: config.subject,
    hs_pipeline: config.hs_pipeline,
    hs_pipeline_stage: config.hs_pipeline_stage,
  };
  for (const k of OPTIONAL_PROPERTY_FIELDS) {
    const v = config[k];
    if (typeof v === "string" && v.length > 0) {
      properties[k] = v;
    }
  }

  const ticket = await refreshAndRetry({
    accountId: input.accountId,
    provider: "hubspot",
    providerAccountId,
    apiCall: (accessToken) =>
      ticketsCreate({ accessToken, properties }),
  });

  // Best-effort associations. Failures don't roll back the ticket
  // — surfaced as warnings.
  const assoc = await refreshAndRetry({
    accountId: input.accountId,
    provider: "hubspot",
    providerAccountId,
    apiCall: (accessToken) =>
      attachAssociations({
        accessToken,
        fromType: "tickets",
        fromId: ticket.id,
        toIds: {
          contacts: config.associatedContactId,
          companies: config.associatedCompanyId,
          deals: config.associatedDealId,
        },
      }),
  });

  return {
    output: {
      ticketId: ticket.id,
      subject: ticket.properties.subject ?? config.subject,
      pipeline: ticket.properties.hs_pipeline ?? config.hs_pipeline,
      pipelineStage:
        ticket.properties.hs_pipeline_stage ?? config.hs_pipeline_stage,
      createdAt: ticket.createdAt ?? null,
      updatedAt: ticket.updatedAt ?? null,
      properties: ticket.properties,
      associationsAttached: assoc.attached,
      associationWarnings: assoc.warnings,
    },
  };
};
