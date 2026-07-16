import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:get_companies`.
 *
 * Mirrors `getCompanies.schema.ts` — identical shape to
 * `get_contacts` (limit, after, properties, filterProperty,
 * filterValue). Hits the companies search endpoint instead.
 *
 * Default property set (when `properties` omitted): `name`, `domain`,
 * `city`, `state`, `country`, `industry`.
 *
 * Outputs match `getCompanies.ts:return` — pagination shape +
 * `companies[]` (sensitive — each entry carries business data + the
 * full HubSpot property map for the requested fields).
 */
export const hubspotGetCompaniesMeta: ActionMeta = {
  key: "hubspot:get_companies",
  provider: "hubspot",
  type: "get_companies",
  displayName: "Get Companies",
  description:
    "List HubSpot CRM companies via `/crm/v3/objects/companies/search`. Read-only. Cursor pagination via `after`. Optional single-property EQ filter via `filterProperty` + `filterValue` (BOTH required). When `properties` is omitted, HubSpot returns the default set: `name`, `domain`, `city`, `state`, `country`, `industry`.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "limit",
      label: "Limit",
      description:
        "Max companies per call (1..100). Use `after` for pagination.",
      type: "number",
      required: false,
      defaultValue: 25,
      numeric: { min: 1, max: 100, integer: true, step: 1 },
    },
    {
      name: "after",
      label: "After (cursor)",
      description:
        "Opaque pagination cursor. Pass the previous call's `nextCursor` to fetch the next page.",
      type: "text",
      required: false,
      advanced: true,
    },
    {
      name: "properties",
      label: "Properties",
      description:
        "HubSpot property names to return for each company. Add chips one at a time (e.g. `name`, `domain`, `industry`, `annualrevenue`, custom property names). Omit to use HubSpot's default set.",
      type: "string-array",
      optionsSource: "hubspot:company_properties",
      allowManualEntry: true,
      required: false,
      advanced: true,
    },
    {
      name: "filterProperty",
      label: "Filter property",
      description:
        "Optional HubSpot property to filter on (EQ match) — pick from the portal's real properties or type a custom internal name. BOTH this field and `Filter value` must be set for the filter to apply.",
      type: "combobox",
      optionsSource: "hubspot:company_properties",
      allowManualEntry: true,
      required: false,
      placeholder: "domain",
    },
    {
      name: "filterValue",
      label: "Filter value",
      description:
        "Only return companies whose chosen property exactly equals this value.",
      type: "text",
      required: false,
      visibleWhen: { field: "filterProperty", valueTruthy: true },
      placeholder: "acme.com",
    },
  ],
  outputs: [
    {
      name: "companies",
      type: "array",
      description:
        "Array of HubSpot companies. Each entry carries `{id, properties, createdAt, updatedAt}` with the property map containing the requested fields. Marked sensitive — each entry carries customer business data (domain / phone / industry / revenue / custom property values).",
      sensitive: true,
    },
    {
      name: "count",
      type: "number",
      description: "Number of companies returned in this page (== `companies.length`).",
    },
    {
      name: "total",
      type: "number",
      description: "HubSpot's total-matches count for the search.",
    },
    {
      name: "nextCursor",
      type: "string",
      description: "Opaque cursor for the next page. Null when no more pages.",
    },
    {
      name: "hasMore",
      type: "boolean",
      description: "True when another page is available.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 60,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
