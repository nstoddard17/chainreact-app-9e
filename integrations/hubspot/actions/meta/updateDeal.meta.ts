import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:update_deal`.
 *
 * Mirrors `updateDeal.schema.ts`: `dealId` (required) + the same 8
 * property fields as `create_deal`, all optional. Handler enforces
 * "at least one property field must be present" at runtime — the meta
 * keeps every property optional so authors can partial-update.
 *
 * `dealId` is plain text — the HubSpot deal-search picker is
 * intentionally deferred (V1 also takes a free-form id). Authors wire
 * from `{{hubspot:create_deal.dealId}}` /
 * `{{hubspot:get_deals.deals[0].id}}`.
 *
 * Pipeline → dealstage cascade is preserved: pipeline listed BEFORE
 * dealstage so the UI flows top→bottom; `dealstage.dependsOn =
 * "pipeline"` matches `hubspotDealStagesResolver.requiredDeps`. Both
 * are optional on update — the cascade only activates when the author
 * elects to change pipeline.
 *
 * Output mirrors `updateDeal.ts:return` exactly — narrower than
 * `create_deal` (no `createdAt`).
 */
export const hubspotUpdateDealMeta: ActionMeta = {
  key: "hubspot:update_deal",
  provider: "hubspot",
  type: "update_deal",
  displayName: "Update Deal",
  description:
    "Update a HubSpot CRM deal via `/crm/v3/objects/deals/{id}`. Requires the deal id and at least one property field to update — runtime rejects empty updates. Pass only the fields you want to change; omitted fields are left untouched.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "dealId",
      label: "Deal ID",
      description:
        "HubSpot deal id (numeric, returned by the API as a string). Usually wired from `{{hubspot:create_deal.dealId}}` or `{{hubspot:get_deals.deals[0].id}}`. Search-by-property picker is a follow-up slice.",
      type: "text",
      required: true,
      placeholder: "12345",
    },
    {
      name: "dealname",
      label: "Deal name",
      description: "HubSpot `dealname` property.",
      type: "text",
      required: false,
    },
    {
      name: "pipeline",
      label: "Pipeline",
      description:
        "Pick a HubSpot deal pipeline. Optional — changing the pipeline typically requires re-picking the stage. When set, gates the `Deal stage` picker.",
      type: "combobox",
      optionsSource: "hubspot:deal_pipelines",
      required: false,
      placeholder: "Search deal pipelines…",
    },
    {
      name: "dealstage",
      label: "Deal stage",
      description:
        "Pick a stage inside the chosen pipeline. Gated on Pipeline — change the pipeline and the stage picker re-fetches. Optional on update; leave both empty to keep the existing stage.",
      type: "combobox",
      optionsSource: "hubspot:deal_stages",
      dependsOn: "pipeline",
      required: false,
      placeholder: "Select Pipeline first",
    },
    {
      name: "amount",
      label: "Amount",
      description:
        "**Numeric STRING** — HubSpot's API expects stringified numbers for CRM property writes. Wire an upstream number through `{{String(value)}}` if needed.",
      type: "text",
      required: false,
    },
    {
      name: "closedate",
      label: "Close date",
      description:
        "HubSpot accepts an ISO 8601 datetime or a millisecond-epoch string.",
      type: "text",
      required: false,
    },
    {
      name: "dealtype",
      label: "Deal type",
      description:
        "HubSpot `dealtype` property. Pick from the connected portal's real, customizable deal-type options, or paste a custom internal value. Stores the internal value, shows the label.",
      type: "combobox",
      optionsSource: "hubspot:deal_dealtype",
      allowManualEntry: true,
      required: false,
      placeholder: "Search deal types or paste a value",
    },
    {
      name: "description",
      label: "Description",
      description: "HubSpot `description` property — free-form text.",
      type: "textarea",
      required: false,
    },
    {
      name: "hubspot_owner_id",
      label: "Owner",
      description:
        "Reassign the deal to a different HubSpot user. The picker returns the owner `id` (NOT the `userId`).",
      type: "combobox",
      optionsSource: "hubspot:owners",
      required: false,
      placeholder: "Search owners…",
    },
  ],
  outputs: [
    {
      name: "dealId",
      type: "string",
      description: "HubSpot deal id (echoed).",
    },
    {
      name: "dealname",
      type: "string",
      description: "Echoed `dealname` property (null when HubSpot didn't return it). Marked sensitive — customer-identifying business data.",
      sensitive: true,
    },
    {
      name: "dealstage",
      type: "string",
      description: "Echoed `dealstage` property after the update.",
    },
    {
      name: "pipeline",
      type: "string",
      description: "Echoed `pipeline` property after the update.",
    },
    {
      name: "amount",
      type: "string",
      description: "Echoed `amount` property (null when omitted). Marked sensitive — financial pipeline data.",
      sensitive: true,
    },
    {
      name: "closedate",
      type: "string",
      description: "Echoed `closedate` property (null when omitted).",
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
        "Full HubSpot deal properties map after the update. Variable-shape — can carry any HubSpot property. Marked sensitive — carries customer business + financial data.",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 80,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Updates a HubSpot CRM deal's properties. Supplied fields overwrite existing values; reversible only by writing the prior values back. May affect sales pipeline reporting + forecasting downstream of HubSpot automations.",
};
