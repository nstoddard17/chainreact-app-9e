import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:update_company`.
 *
 * Mirrors `updateCompany.schema.ts`: `companyId` (required) + the
 * same 14 standard company-property fields as `create_company`, all
 * optional. Handler enforces "at least one property field must be
 * present" at runtime.
 *
 * `companyId` is plain text in V1 — search-by-domain picker is a
 * follow-up polish slice (HUBSPOT-1 §4.2 deferred-resolver list).
 *
 * Outputs match `updateCompany.ts:return` — narrower than create (no
 * `wasUpdate` / `wasSkip` since update has one path).
 */
export const hubspotUpdateCompanyMeta: ActionMeta = {
  key: "hubspot:update_company",
  provider: "hubspot",
  type: "update_company",
  displayName: "Update Company",
  description:
    "Update a HubSpot CRM company via `/crm/v3/objects/companies/{id}`. Requires the company id and at least one property field — runtime rejects empty updates. Pass only the fields you want to change; omitted fields are left untouched.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "companyId",
      label: "Company ID",
      description:
        "HubSpot company id (numeric, returned as a string). Usually wired from `{{hubspot:create_company.companyId}}` or `{{hubspot:get_companies.companies[0].id}}`. Search-by-domain picker is a follow-up slice.",
      type: "text",
      required: true,
      placeholder: "12345",
    },
    {
      name: "name",
      label: "Name",
      description: "HubSpot `name` property.",
      type: "text",
      required: false,
    },
    {
      name: "domain",
      label: "Domain",
      description: "HubSpot `domain` property. Changing this may affect dedup keys for downstream automations.",
      type: "text",
      required: false,
    },
    {
      name: "phone",
      label: "Phone",
      description: "HubSpot `phone` property.",
      type: "text",
      required: false,
    },
    {
      name: "website",
      label: "Website",
      description: "HubSpot `website` property.",
      type: "text",
      required: false,
    },
    {
      name: "address",
      label: "Address",
      description: "HubSpot `address` property.",
      type: "text",
      required: false,
    },
    {
      name: "city",
      label: "City",
      description: "HubSpot `city` property.",
      type: "text",
      required: false,
    },
    {
      name: "state",
      label: "State / region",
      description: "HubSpot `state` property.",
      type: "text",
      required: false,
    },
    {
      name: "zip",
      label: "ZIP / postal code",
      description: "HubSpot `zip` property.",
      type: "text",
      required: false,
    },
    {
      name: "country",
      label: "Country",
      description: "HubSpot `country` property.",
      type: "text",
      required: false,
    },
    {
      name: "industry",
      label: "Industry",
      description: "HubSpot `industry` property.",
      type: "text",
      required: false,
    },
    {
      name: "description",
      label: "Description",
      description: "HubSpot `description` property.",
      type: "textarea",
      required: false,
    },
    {
      name: "annualrevenue",
      label: "Annual revenue",
      description:
        "**Numeric STRING** — HubSpot's API expects stringified numbers. Wire upstream numbers through `{{String(value)}}` if needed.",
      type: "text",
      required: false,
    },
    {
      name: "numberofemployees",
      label: "Number of employees",
      description: "**Numeric STRING** — same shape as `Annual revenue`.",
      type: "text",
      required: false,
    },
    {
      name: "lifecyclestage",
      label: "Lifecycle stage",
      description: "HubSpot `lifecyclestage` property. Portal-configured enum.",
      type: "text",
      required: false,
    },
  ],
  outputs: [
    {
      name: "companyId",
      type: "string",
      description: "HubSpot company id (echoed).",
    },
    {
      name: "name",
      type: "string",
      description: "Echoed `name` property (null when omitted). Marked sensitive — customer-identifying business data.",
      sensitive: true,
    },
    {
      name: "domain",
      type: "string",
      description: "Echoed `domain` property (null when omitted). Marked sensitive — customer-identifying business data.",
      sensitive: true,
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
        "Full HubSpot company properties map after the update. Variable-shape; marked sensitive.",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 50,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Updates a HubSpot CRM company's properties. Supplied fields overwrite existing values; reversible only by writing the prior values back.",
};
