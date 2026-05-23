import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:get_deals`.
 *
 * Mirrors `getDeals.schema.ts` — same shape as `get_contacts` /
 * `get_companies` (limit / after / properties / filterProperty +
 * filterValue). Default property set when `properties` is omitted
 * (handler-side): `dealname`, `amount`, `dealstage`, `pipeline`,
 * `closedate`.
 *
 * Outputs match `getDeals.ts:return` — pagination shape + `deals[]`.
 * The deals array is marked sensitive — each entry carries the HubSpot
 * property map with customer business + financial data (dealname,
 * amount, owner, etc.).
 */
export const hubspotGetDealsMeta: ActionMeta = {
  key: "hubspot:get_deals",
  provider: "hubspot",
  type: "get_deals",
  displayName: "Get Deals",
  description:
    "List HubSpot CRM deals via `/crm/v3/objects/deals/search`. Read-only. Cursor pagination via `after` (use the prior response's `nextCursor`). Optional single-property EQ filter via `filterProperty` + `filterValue` (BOTH must be present). When `properties` is omitted, returns the default set: `dealname`, `amount`, `dealstage`, `pipeline`, `closedate`.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "limit",
      label: "Limit",
      description:
        "Max deals per call (1..100, HubSpot's documented cap). Omit for HubSpot's default. Use `after` for pagination.",
      type: "number",
      required: false,
      numeric: { min: 1, max: 100, integer: true, step: 1 },
    },
    {
      name: "after",
      label: "After (cursor)",
      description:
        "Opaque pagination cursor. Pass the previous call's `nextCursor` to fetch the next page. Omit for the first page.",
      type: "text",
      required: false,
    },
    {
      name: "properties",
      label: "Properties",
      description:
        "HubSpot property names to return for each deal. Add property names as individual chips (e.g. `dealname`, `amount`, `dealstage`, `pipeline`, `closedate`, custom property names). Omit to use HubSpot's default set.",
      type: "string-array",
      required: false,
    },
    {
      name: "filterProperty",
      label: "Filter property",
      description:
        "Optional HubSpot property name to filter on (EQ match). Pair with `Filter value` — BOTH fields must be present for the filter to apply.",
      type: "text",
      required: false,
      placeholder: "dealstage",
    },
    {
      name: "filterValue",
      label: "Filter value",
      description: "Value to EQ-match against `Filter property`. BOTH `Filter property` and this field must be set.",
      type: "text",
      required: false,
      placeholder: "closedwon",
    },
  ],
  outputs: [
    {
      name: "deals",
      type: "array",
      description:
        "Array of HubSpot deals. Each entry carries `{id, properties, createdAt, updatedAt}` with the property map containing the fields requested via `Properties` (or HubSpot's default set). Marked sensitive — each entry carries customer business + financial data (dealname / amount / owner / custom property values).",
      sensitive: true,
    },
    {
      name: "count",
      type: "number",
      description: "Number of deals returned in this page (== `deals.length`).",
    },
    {
      name: "total",
      type: "number",
      description: "HubSpot's total-matches count for the search (across all pages).",
    },
    {
      name: "nextCursor",
      type: "string",
      description: "Opaque cursor for the next page. Null when there are no more pages.",
    },
    {
      name: "hasMore",
      type: "boolean",
      description: "True when another page is available — call this action again with `After (cursor)` set to `nextCursor`.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 90,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
