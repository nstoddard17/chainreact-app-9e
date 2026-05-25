import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:create_deal`.
 *
 * Mirrors `createDeal.schema.ts` (8 fields). Required: `dealname` +
 * `dealstage`. `pipeline` is optional in the schema (HubSpot defaults
 * to the portal's "default" pipeline when omitted), but the meta lists
 * it BEFORE `dealstage` so the UI cascade flows top→bottom: pick
 * pipeline → pick stage. The HUBSPOT-2 `hubspot:deal_pipelines` +
 * `hubspot:deal_stages` resolvers back the two pickers; `dealstage`
 * declares `dependsOn: "pipeline"` to match
 * `hubspotDealStagesResolver.requiredDeps = ["pipeline"]`.
 *
 * `amount` is TEXT (`z.string()` at the schema level) — HubSpot's API
 * expects stringified numeric values for CRM property writes. The meta
 * description calls this out to prevent authors from wiring an upstream
 * `number` output without `String(...)` coercion.
 *
 * `hubspot_owner_id` is the first consumer of the `hubspot:owners`
 * resolver (HUBSPOT-3 contact/company schemas didn't accept it).
 *
 * Outputs mirror `createDeal.ts:return` exactly. `dealname` + `amount`
 * + the `properties` map are marked sensitive — `dealname` carries
 * customer-identifying business data, `amount` carries financial
 * pipeline data, `properties` is the variable-shape map that can
 * include either.
 */
export const hubspotCreateDealMeta: ActionMeta = {
  key: "hubspot:create_deal",
  provider: "hubspot",
  type: "create_deal",
  displayName: "Create Deal",
  description:
    "Create a new HubSpot CRM deal via `/crm/v3/objects/deals`. Requires `dealname` + `dealstage`. `pipeline` is optional — HubSpot defaults to the portal's default deal pipeline when omitted; setting it explicitly is required if you also want to scope `dealstage` via the cascade. NO duplicate-handling on deals: HubSpot deals have no natural unique-by-property contract (dealname can repeat).",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "dealname",
      label: "Deal name",
      description: "Required. Free-form HubSpot `dealname` property.",
      type: "text",
      required: true,
      placeholder: "Acme — Enterprise Deal Q2",
    },
    {
      name: "pipeline",
      label: "Pipeline",
      description:
        "Pick a HubSpot deal pipeline. Optional — leave empty to use the portal's default pipeline. When set, gates the `Deal stage` picker.",
      type: "combobox",
      optionsSource: "hubspot:deal_pipelines",
      required: false,
      placeholder: "Search deal pipelines…",
    },
    {
      name: "dealstage",
      label: "Deal stage",
      description:
        "Required. Pick a stage inside the chosen pipeline. Gated on Pipeline — change the pipeline and the stage picker re-fetches.",
      type: "combobox",
      optionsSource: "hubspot:deal_stages",
      dependsOn: "pipeline",
      required: true,
      placeholder: "Select Pipeline first",
    },
    {
      name: "amount",
      label: "Amount",
      description:
        "**Numeric STRING** — HubSpot's API expects stringified numbers for CRM property writes. Wire an upstream number through `{{String(value)}}` if needed. Currency is the portal's default; HubSpot does not accept a per-deal currency override on this property.",
      type: "text",
      required: false,
      placeholder: "5000",
    },
    {
      name: "closedate",
      label: "Close date",
      description:
        "Expected close date. HubSpot accepts an ISO 8601 datetime (`2026-12-31T00:00:00Z`) or a millisecond-epoch string. Wire upstream date variables through `{{... .toISOString()}}` for the ISO form.",
      type: "text",
      required: false,
      placeholder: "2026-12-31T00:00:00Z",
    },
    {
      name: "dealtype",
      label: "Deal type",
      description:
        "HubSpot `dealtype` property. Portal-configured enum (typical values: `newbusiness`, `existingbusiness`).",
      type: "text",
      required: false,
      placeholder: "newbusiness",
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
        "HubSpot user account that owns this deal. Pick from the connected portal's owners list. The picker returns the owner `id` (NOT the `userId`) — that's the value HubSpot's `hubspot_owner_id` property accepts.",
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
      description: "HubSpot deal id. Wire downstream into `update_deal` / engagement associations.",
    },
    {
      name: "dealname",
      type: "string",
      description: "Echoed `dealname` property — equals `properties.dealname` when HubSpot returns it. Marked sensitive — customer-identifying business data.",
      sensitive: true,
    },
    {
      name: "dealstage",
      type: "string",
      description: "Echoed `dealstage` property — the stage id the deal landed in.",
    },
    {
      name: "pipeline",
      type: "string",
      description: "Echoed `pipeline` property — the pipeline id the deal landed in (null when HubSpot didn't return it).",
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
        "Full HubSpot deal properties map — variable-shape object that can carry every property the workflow set + every property HubSpot defaults. Marked sensitive — carries customer business + financial data (dealname / amount / owner / custom properties).",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 70,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a HubSpot CRM deal visible to all portal users. May affect sales pipeline reporting + forecasting downstream of HubSpot automations.",
};
