import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:create_ticket`.
 *
 * Mirrors `createTicket.schema.ts` (11 fields). Required: `subject` +
 * `hs_pipeline` + `hs_pipeline_stage`. `hs_pipeline_stage` declares
 * `dependsOn: "hs_pipeline"` to match
 * `hubspotTicketStagesResolver.requiredDeps = ["hs_pipeline"]`.
 *
 * `hs_ticket_priority` is a `select` with the 3 enum values from the
 * schema (`LOW` / `MEDIUM` / `HIGH`). NO defaultValue per the Q11 "no
 * hidden defaults" rule — the schema makes the field optional and the
 * handler drops empty values from the payload.
 *
 * Associations (`associatedContactId` / `associatedCompanyId` /
 * `associatedDealId`) are best-effort — failures surface as
 * `associationWarnings` rather than rolling back the ticket. All three
 * are plain text ids (search-by pickers are deferred per the same
 * rationale as `update_deal.dealId`).
 *
 * Output mirrors `createTicket.ts:return` exactly. `subject` + the
 * `properties` map are marked sensitive — ticket subjects often carry
 * customer-identifying summaries of the support issue.
 */
export const hubspotCreateTicketMeta: ActionMeta = {
  key: "hubspot:create_ticket",
  provider: "hubspot",
  type: "create_ticket",
  displayName: "Create Ticket",
  description:
    "Create a new HubSpot CRM ticket via `/crm/v3/objects/tickets`. Requires `subject` + `hs_pipeline` + `hs_pipeline_stage`. Optional associations attach the ticket to a contact / company / deal in parallel; failed associations surface as `associationWarnings` in the output rather than rolling back the ticket create.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "subject",
      label: "Subject",
      description: "Required. Free-form HubSpot ticket `subject` property.",
      type: "text",
      required: true,
      placeholder: "Cannot log in after password reset",
    },
    {
      name: "hs_pipeline",
      label: "Pipeline",
      description:
        "Required. Pick a HubSpot ticket pipeline. Gates the `Stage` picker.",
      type: "combobox",
      optionsSource: "hubspot:ticket_pipelines",
      required: true,
      placeholder: "Search ticket pipelines…",
    },
    {
      name: "hs_pipeline_stage",
      label: "Stage",
      description:
        "Required. Pick a stage inside the chosen pipeline. Gated on Pipeline — change the pipeline and the stage picker re-fetches.",
      type: "combobox",
      optionsSource: "hubspot:ticket_stages",
      dependsOn: "hs_pipeline",
      required: true,
      placeholder: "Select Pipeline first",
    },
    {
      name: "content",
      label: "Content",
      description:
        "HubSpot `content` property — the ticket body / customer-facing description. Free-form text.",
      type: "textarea",
      required: false,
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
        "HubSpot `hs_ticket_category` property. Pick from the portal's real, customizable categories, or paste a custom internal value. Stores the internal value, shows the label.",
      type: "combobox",
      optionsSource: "hubspot:ticket_category",
      allowManualEntry: true,
      required: false,
    },
    {
      name: "source_type",
      label: "Source",
      description:
        "HubSpot `source_type` property. Pick from the portal's real, customizable sources, or paste a custom internal value. Stores the internal value, shows the label.",
      type: "combobox",
      optionsSource: "hubspot:ticket_source_type",
      allowManualEntry: true,
      required: false,
    },
    {
      name: "hubspot_owner_id",
      label: "Owner",
      description:
        "HubSpot user account that owns this ticket. The picker returns the owner `id` (NOT the `userId`).",
      type: "combobox",
      optionsSource: "hubspot:owners",
      required: false,
      placeholder: "Search owners…",
    },
    {
      name: "associatedContactId",
      label: "Associated contact ID",
      description:
        "Optional HubSpot contact id to associate with this ticket. Best-effort — failures surface as `associationWarnings`. Usually wired from `{{hubspot:get_contacts.contacts[0].id}}`.",
      type: "text",
      required: false,
    },
    {
      name: "associatedCompanyId",
      label: "Associated company ID",
      description:
        "Optional HubSpot company id to associate with this ticket. Best-effort — failures surface as `associationWarnings`.",
      type: "text",
      required: false,
    },
    {
      name: "associatedDealId",
      label: "Associated deal ID",
      description:
        "Optional HubSpot deal id to associate with this ticket. Best-effort — failures surface as `associationWarnings`.",
      type: "text",
      required: false,
    },
  ],
  outputs: [
    {
      name: "ticketId",
      type: "string",
      description: "HubSpot ticket id. Wire downstream into `update_ticket` / engagement associations.",
    },
    {
      name: "subject",
      type: "string",
      description: "Echoed `subject` property. Marked sensitive — ticket subjects often carry customer-identifying summaries of the support issue.",
      sensitive: true,
    },
    {
      name: "pipeline",
      type: "string",
      description: "Echoed `hs_pipeline` property — the pipeline id the ticket landed in.",
    },
    {
      name: "pipelineStage",
      type: "string",
      description: "Echoed `hs_pipeline_stage` property — the stage id the ticket landed in.",
    },
    {
      name: "createdAt",
      type: "string",
      description: "ISO 8601 timestamp from HubSpot.",
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
        "Full HubSpot ticket properties map — variable-shape object. Marked sensitive — can carry the ticket body (`content`), customer-identifying subject text, and custom support-context properties.",
      sensitive: true,
    },
    {
      name: "associationsAttached",
      type: "array",
      description:
        "Per-association success report: `{toType, toId}[]` for every association the helper completed. Drives downstream branching when partial-association recovery matters.",
    },
    {
      name: "associationWarnings",
      type: "array",
      description:
        "Per-association failure report: `{toType, toId, message}[]` for every association that FAILED. Empty when all associations succeeded. The ticket itself was created regardless — failed associations are non-fatal.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 100,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a HubSpot CRM ticket visible to all portal users and to the assigned owner. May trigger support-workflow automations (auto-replies, SLA timers) downstream.",
};
