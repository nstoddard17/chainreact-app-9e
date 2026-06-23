import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:create_company`.
 *
 * Mirrors `createCompany.schema.ts` (14 standard company-property
 * fields + `name` + `duplicateHandling`). Same `duplicateHandling`
 * shape as `create_contact` — recovery uses `findCompanyByDomain`
 * (search-by-property), NOT regex-extract from error messages.
 *
 * `annualrevenue` + `numberofemployees` are TEXT (`z.string()` at the
 * schema level) — HubSpot's API expects stringified numeric values
 * for CRM property writes. The meta description calls this out to
 * prevent authors from wiring an upstream `number` output without
 * `String(...)` coercion.
 *
 * Outputs mirror `createCompany.ts:return` — `name`, `domain`, and
 * `properties` marked sensitive per the HUBSPOT-1 plan (business
 * identification + variable-shape property map).
 */
export const hubspotCreateCompanyMeta: ActionMeta = {
  key: "hubspot:create_company",
  provider: "hubspot",
  type: "create_company",
  displayName: "Create Company",
  description:
    "Create a new HubSpot CRM company via `/crm/v3/objects/companies`. Requires `name`; `domain` is the recommended dedup key. On HubSpot's 409 (duplicate domain), the deterministic search-by-domain path can `update` the existing company or `skip` and return it unchanged — pick via `Duplicate handling`. Output's `wasUpdate` / `wasSkip` booleans tell downstream nodes which path ran.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "name",
      label: "Name",
      description: "Company name. Required.",
      type: "text",
      required: true,
      placeholder: "Acme Inc.",
    },
    {
      name: "domain",
      label: "Domain",
      description:
        "Company domain (e.g. `acme.com`). Optional but recommended — HubSpot dedup automations key on this. Used by the `update` / `skip` duplicate-handling paths to find the existing company.",
      type: "text",
      required: false,
      placeholder: "acme.com",
    },
    {
      name: "phone",
      sensitivity: "recipient",
      label: "Phone",
      description: "HubSpot `phone` property — free-form string.",
      type: "text",
      required: false,
    },
    {
      name: "website",
      label: "Website",
      description: "HubSpot `website` property — free-form URL string.",
      type: "text",
      required: false,
      placeholder: "https://acme.com",
    },
    {
      name: "address",
      sensitivity: "recipient",
      label: "Address",
      description: "HubSpot `address` property — single line.",
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
      description: "HubSpot `industry` property. Free-form string in the v3 API.",
      type: "text",
      required: false,
      placeholder: "Software",
    },
    {
      name: "description",
      label: "Description",
      description: "HubSpot `description` property — free-form text.",
      type: "textarea",
      required: false,
    },
    {
      name: "annualrevenue",
      label: "Annual revenue",
      description:
        "**Numeric STRING** — HubSpot's API expects stringified numbers for CRM property writes. Wire an upstream number through `{{String(value)}}` if needed. Example: `\"5000000\"`.",
      type: "text",
      required: false,
      placeholder: "5000000",
    },
    {
      name: "numberofemployees",
      label: "Number of employees",
      description:
        "**Numeric STRING** — same shape as `Annual revenue`. Example: `\"250\"`.",
      type: "text",
      required: false,
      placeholder: "250",
    },
    {
      name: "lifecyclestage",
      label: "Lifecycle stage",
      description:
        "HubSpot `lifecyclestage` property on the company. Pick from the portal's real, customizable stages, or paste a custom internal value. Stores the internal stage name, shows the label.",
      type: "combobox",
      optionsSource: "hubspot:company_lifecyclestage",
      allowManualEntry: true,
      required: false,
    },
    {
      name: "duplicateHandling",
      label: "Duplicate handling",
      description:
        "What to do when HubSpot returns 409 (a company with this domain already exists). `fail` surfaces the error; `update` PATCHes the existing company with the supplied properties; `skip` returns the existing company unchanged. Requires `Domain` for the search-by-property recovery.",
      type: "select",
      required: true,
      defaultValue: "fail",
      options: [
        {
          value: "fail",
          label: "fail",
          description: "Surface the 409 error. Default.",
        },
        {
          value: "update",
          label: "update",
          description: "Search-by-domain + PATCH existing company.",
        },
        {
          value: "skip",
          label: "skip",
          description: "Search-by-domain + return existing company unchanged.",
        },
      ],
    },
  ],
  outputs: [
    {
      name: "companyId",
      type: "string",
      description: "HubSpot company id. Wire downstream into `update_company` / engagement associations.",
    },
    {
      name: "name",
      type: "string",
      description: "Echoed `name` property — equals `properties.name` when HubSpot returns it. Marked sensitive — customer-identifying business data.",
      sensitive: true,
    },
    {
      name: "domain",
      type: "string",
      description: "Echoed `domain` property (null when omitted). Marked sensitive — customer-identifying business data.",
      sensitive: true,
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
      name: "wasUpdate",
      type: "boolean",
      description: "True when `Duplicate handling: update` recovered from a 409 by PATCHing the existing company.",
    },
    {
      name: "wasSkip",
      type: "boolean",
      description: "True when `Duplicate handling: skip` returned the existing company unchanged.",
    },
    {
      name: "properties",
      type: "object",
      description:
        "Full HubSpot company properties map — variable-shape object. Marked sensitive — carries customer business data (domain / phone / industry / revenue / custom properties).",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates or updates a HubSpot CRM company visible to all portal users. Existing properties are overwritten when `Duplicate handling: update` is chosen.",
};
