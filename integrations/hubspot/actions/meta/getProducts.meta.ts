import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:get_products`.
 *
 * Mirrors `getProducts.schema.ts` — same shape as `get_contacts` /
 * `get_deals` / `get_tickets`. Default property set when omitted
 * (handler-side): `name`, `description`, `price`, `hs_sku`.
 *
 * Outputs match `getProducts.ts:return` — pagination shape +
 * `products[]`. The products array is sensitive — each entry
 * carries the HubSpot property map with catalog + financial data.
 */
export const hubspotGetProductsMeta: ActionMeta = {
  key: "hubspot:get_products",
  provider: "hubspot",
  type: "get_products",
  displayName: "Get Products",
  description:
    "List HubSpot CRM products via `/crm/v3/objects/products/search`. Read-only. Cursor pagination via `after` (use the prior response's `nextCursor`). Optional single-property EQ filter via `filterProperty` + `filterValue` (BOTH must be present). When `properties` is omitted, returns the default set: `name`, `description`, `price`, `hs_sku`.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "limit",
      label: "Limit",
      description:
        "Max products per call (1..100, HubSpot's documented cap). Omit for HubSpot's default. Use `after` for pagination.",
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
        "HubSpot property names to return for each product. Add property names as individual chips (e.g. `name`, `description`, `price`, `hs_sku`, `hs_cost_of_goods_sold`). Omit to use HubSpot's default set.",
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
      placeholder: "hs_sku",
    },
    {
      name: "filterValue",
      label: "Filter value",
      description: "Value to EQ-match against `Filter property`. BOTH `Filter property` and this field must be set.",
      type: "text",
      required: false,
    },
  ],
  outputs: [
    {
      name: "products",
      type: "array",
      description:
        "Array of HubSpot products. Each entry carries `{id, properties, createdAt, updatedAt}` with the property map containing the fields requested via `Properties` (or HubSpot's default set). Marked sensitive — each entry carries catalog + financial data.",
      sensitive: true,
    },
    {
      name: "count",
      type: "number",
      description: "Number of products returned in this page (== `products.length`).",
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
  displayOrder: 220,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
