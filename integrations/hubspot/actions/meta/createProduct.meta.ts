import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:create_product`.
 *
 * Mirrors `createProduct.schema.ts` (6 fields). Required: `name`.
 * Numeric fields (`price`, `hs_cost_of_goods_sold`) are TEXT —
 * HubSpot's CRM property API expects stringified numerics.
 *
 * Products live STANDALONE in HubSpot's CRM — line items reference
 * them by `hs_product_id`. No associations on create_product (V1
 * parity).
 *
 * Output mirrors `createProduct.ts:return`. `name` + `price` +
 * `properties` are sensitive (customer-identifying business data +
 * financial data); `sku` stays non-sensitive (SKUs are typically
 * public catalog identifiers).
 */
export const hubspotCreateProductMeta: ActionMeta = {
  key: "hubspot:create_product",
  provider: "hubspot",
  type: "create_product",
  displayName: "Create Product",
  description:
    "Create a HubSpot CRM product via `/crm/v3/objects/products`. Requires `name`. Numeric fields (`price`, `hs_cost_of_goods_sold`) are stringified numerics per HubSpot's wire format. Products live standalone — line items reference them via `hs_product_id`.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "name",
      label: "Name",
      description: "Required. Product name.",
      type: "text",
      required: true,
      placeholder: "Pro Subscription",
    },
    {
      name: "description",
      label: "Description",
      description: "HubSpot `description` property — free-form text.",
      type: "textarea",
      required: false,
    },
    {
      name: "price",
      label: "Price",
      description:
        "**Numeric STRING** — HubSpot expects stringified numbers for CRM property writes. Currency is the portal's default. Wire an upstream number through `{{String(value)}}` if needed.",
      type: "text",
      required: false,
      placeholder: "99.00",
    },
    {
      name: "hs_sku",
      label: "SKU",
      description: "HubSpot `hs_sku` property — free-form catalog SKU string.",
      type: "text",
      required: false,
      placeholder: "PRO-MONTHLY",
    },
    {
      name: "hs_cost_of_goods_sold",
      label: "Cost of goods sold",
      description:
        "**Numeric STRING** — HubSpot `hs_cost_of_goods_sold` property. Same shape as `Price`.",
      type: "text",
      required: false,
      placeholder: "25.00",
    },
    {
      name: "hs_recurring_billing_period",
      label: "Recurring billing period",
      description:
        "HubSpot `hs_recurring_billing_period` property. ISO 8601 duration (e.g. `P1M` for monthly, `P1Y` for yearly) — free-form here; HubSpot validates server-side.",
      type: "text",
      required: false,
      placeholder: "P1M",
    },
  ],
  outputs: [
    {
      name: "productId",
      type: "string",
      description: "HubSpot product id. Wire downstream into `create_line_item.hs_product_id`.",
    },
    {
      name: "name",
      type: "string",
      description: "Echoed `name` property. Marked sensitive — product names carry customer-identifying catalog data.",
      sensitive: true,
    },
    {
      name: "price",
      type: "string",
      description: "Echoed `price` property (null when omitted). Marked sensitive — financial catalog data.",
      sensitive: true,
    },
    {
      name: "sku",
      type: "string",
      description: "Echoed `hs_sku` property (null when omitted). Public catalog identifier — not marked sensitive.",
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
        "Full HubSpot product properties map. Variable-shape. Marked sensitive — carries name + price + cost-of-goods + custom properties.",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 200,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a HubSpot CRM product visible to all portal users. May appear in HubSpot quote / line-item / deal workflows downstream.",
};
