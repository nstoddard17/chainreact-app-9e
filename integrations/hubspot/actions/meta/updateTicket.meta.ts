import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:update_ticket`.
 *
 * Mirrors `updateTicket.schema.ts`: `ticketId` (required) + 8 property
 * fields (all optional). Handler enforces "at least one property field
 * must be present" at runtime — the meta keeps every property optional
 * so authors can partial-update.
 *
 * V1 + V2 do NOT ship association handling on update (only on create).
 * Re-linking a ticket is a separate flow; this meta intentionally
 * omits `associatedContactId` / `associatedCompanyId` / `associatedDealId`.
 *
 * Pipeline → stage cascade is preserved: `hs_pipeline` listed BEFORE
 * `hs_pipeline_stage`; the stage's `dependsOn: "hs_pipeline"` matches
 * the resolver's `requiredDeps`. Both are optional on update — the
 * cascade only activates when the author elects to change pipeline.
 *
 * `hs_ticket_priority` is a `select` matching the schema's 3-value
 * enum (LOW / MEDIUM / HIGH), NO defaultValue per Q11.
 *
 * Output mirrors `updateTicket.ts:return` exactly — narrower than
 * `create_ticket` (no `createdAt`, no associations).
 */
export const hubspotUpdateTicketMeta: ActionMeta = {
  key: "hubspot:update_ticket",
  provider: "hubspot",
  type: "update_ticket",
  displayName: "Update Ticket",
  description:
    "Update a HubSpot CRM ticket via `/crm/v3/objects/tickets/{id}`. Requires the ticket id and at least one property field to update — runtime rejects empty updates. Pass only the fields you want to change; omitted fields are left untouched. Association re-linking is NOT handled here — use a downstream action for that.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "ticketId",
      label: "Ticket ID",
      description:
        "HubSpot ticket id (numeric, returned by the API as a string). Usually wired from `{{hubspot:create_ticket.ticketId}}` or `{{hubspot:get_tickets.tickets[0].id}}`. Search-by-property picker is a follow-up slice.",
      type: "text",
      required: true,
      placeholder: "12345",
    },
    {
      name: "subject",
      label: "Subject",
      description: "HubSpot `subject` property.",
      type: "text",
      required: false,
    },
    {
      name: "content",
      label: "Content",
      description:
        "HubSpot `content` property — the ticket body / customer-facing description.",
      type: "textarea",
      required: false,
    },
    {
      name: "hs_pipeline",
      label: "Pipeline",
      description:
        "Pick a HubSpot ticket pipeline. Optional — changing the pipeline typically requires re-picking the stage. When set, gates the `Stage` picker.",
      type: "combobox",
      optionsSource: "hubspot:ticket_pipelines",
      required: false,
      placeholder: "Search ticket pipelines…",
    },
    {
      name: "hs_pipeline_stage",
      label: "Stage",
      description:
        "Pick a stage inside the chosen pipeline. Gated on Pipeline — change the pipeline and the stage picker re-fetches. Optional on update; leave both empty to keep the existing stage.",
      type: "combobox",
      optionsSource: "hubspot:ticket_stages",
      dependsOn: "hs_pipeline",
      required: false,
      placeholder: "Select Pipeline first",
    },
    {
      name: "hs_ticket_priority",
      label: "Priority",
      description: "HubSpot `hs_ticket_priority` property. One of `LOW`, `MEDIUM`, `HIGH`.",
      type: "select",
      required: false,
      options: [
        { value: "LOW", label: "LOW" },
        { value: "MEDIUM", label: "MEDIUM" },
        { value: "HIGH", label: "HIGH" },
      ],
    },
    {
      name: "hs_ticket_category",
      label: "Category",
      description:
        "HubSpot `hs_ticket_category` property. Pick from the portal's real, customizable categories, or paste a custom internal value.",
      type: "combobox",
      optionsSource: "hubspot:ticket_category",
      allowManualEntry: true,
      required: false,
    },
    {
      name: "source_type",
      label: "Source",
      description:
        "HubSpot `source_type` property. Pick from the portal's real, customizable sources, or paste a custom internal value.",
      type: "combobox",
      optionsSource: "hubspot:ticket_source_type",
      allowManualEntry: true,
      required: false,
    },
    {
      name: "hubspot_owner_id",
      label: "Owner",
      description:
        "Reassign the ticket to a different HubSpot user. The picker returns the owner `id` (NOT the `userId`).",
      type: "combobox",
      optionsSource: "hubspot:owners",
      required: false,
      placeholder: "Search owners…",
    },
  ],
  outputs: [
    {
      name: "ticketId",
      type: "string",
      description: "HubSpot ticket id (echoed).",
    },
    {
      name: "subject",
      type: "string",
      description: "Echoed `subject` property (null when HubSpot didn't return it). Marked sensitive — ticket subjects carry customer-identifying summaries.",
      sensitive: true,
    },
    {
      name: "pipeline",
      type: "string",
      description: "Echoed `hs_pipeline` property after the update.",
    },
    {
      name: "pipelineStage",
      type: "string",
      description: "Echoed `hs_pipeline_stage` property after the update.",
    },
    {
      name: "updatedAt",
      type: "string",
      description: "ISO 8601 timestamp from HubSpot.",
    },
    {
      name: "properties",
      type: "object",
      description:
        "Full HubSpot ticket properties map after the update. Variable-shape — can carry any HubSpot property including the ticket body (`content`). Marked sensitive — customer-identifying support-context data.",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 110,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Updates a HubSpot CRM ticket's properties. Supplied fields overwrite existing values; reversible only by writing the prior values back. May trigger support-workflow automations (SLA timers, status-change notifications) downstream.",
};
