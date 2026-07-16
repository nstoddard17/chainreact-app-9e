import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:get_line_items`.
 *
 * Mirrors `getLineItems.schema.ts` — same shape as `get_contacts` /
 * `get_deals` / `get_tickets` / `get_products`. Default property
 * set when omitted (handler-side): `name`, `hs_product_id`,
 * `quantity`, `price`, `amount`.
 *
 * Outputs match `getLineItems.ts:return` — pagination shape +
 * `lineItems[]`. The lineItems array is sensitive — each entry
 * carries the HubSpot property map with commerce + financial data.
 */
export const hubspotGetLineItemsMeta: ActionMeta = {
  key: "hubspot:get_line_items",
  provider: "hubspot",
  type: "get_line_items",
  displayName: "Get Line Items",
  description:
    "List HubSpot CRM line items via `/crm/v3/objects/line_items/search`. Read-only. Cursor pagination via `after` (use the prior response's `nextCursor`). Optional single-property EQ filter via `filterProperty` + `filterValue` (BOTH must be present). When `properties` is omitted, returns the default set: `name`, `hs_product_id`, `quantity`, `price`, `amount`.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "limit",
      label: "Limit",
      description:
        "Max line items per call (1..100, HubSpot's documented cap). Use `after` for pagination.",
      type: "number",
      required: false,
      defaultValue: 25,
      numeric: { min: 1, max: 100, integer: true, step: 1 },
    },
    {
      name: "after",
      label: "After (cursor)",
      description:
        "Opaque pagination cursor. Pass the previous call's `nextCursor` to fetch the next page. Omit for the first page.",
      type: "text",
      required: false,
      advanced: true,
    },
    {
      name: "properties",
      label: "Properties",
      description:
        "HubSpot property names to return for each line item. Add property names as individual chips (e.g. `name`, `hs_product_id`, `quantity`, `price`, `amount`, `discount`). Omit to use HubSpot's default set.",
      type: "string-array",
      optionsSource: "hubspot:line_item_properties",
      allowManualEntry: true,
      required: false,
      advanced: true,
    },
    {
      name: "filterProperty",
      label: "Filter property",
      description:
        "Optional HubSpot property to filter on (EQ match) — pick from the portal's real properties or type a custom internal name. Pair with `Filter value` — BOTH fields must be present for the filter to apply.",
      type: "combobox",
      optionsSource: "hubspot:line_item_properties",
      allowManualEntry: true,
      required: false,
      placeholder: "hs_product_id",
    },
    {
      name: "filterValue",
      label: "Filter value",
      description:
        "Only return line items whose chosen property exactly equals this value.",
      type: "text",
      required: false,
      visibleWhen: { field: "filterProperty", valueTruthy: true },
    },
  ],
  outputs: [
    {
      name: "lineItems",
      type: "array",
      description:
        "Array of HubSpot line items. Each entry carries `{id, properties, createdAt, updatedAt}` with the property map containing the fields requested via `Properties` (or HubSpot's default set). Marked sensitive — each entry carries commerce + financial data (name / quantity / price / amount / custom properties).",
      sensitive: true,
    },
    {
      name: "count",
      type: "number",
      description: "Number of line items returned in this page (== `lineItems.length`).",
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
  displayOrder: 250,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
