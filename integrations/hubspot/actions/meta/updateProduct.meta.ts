import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:update_product`.
 *
 * Mirrors `updateProduct.schema.ts`: `productId` (required) + the
 * same 5 property fields as `create_product`, all optional. Handler
 * enforces "at least one property field must be present" at runtime.
 *
 * Output mirrors `updateProduct.ts:return` — narrower than
 * `create_product` (no `createdAt`).
 */
export const hubspotUpdateProductMeta: ActionMeta = {
  key: "hubspot:update_product",
  provider: "hubspot",
  type: "update_product",
  displayName: "Update Product",
  description:
    "Update a HubSpot CRM product via `/crm/v3/objects/products/{id}`. Requires the product id and at least one property field — runtime rejects empty updates. Pass only the fields you want to change; omitted fields are left untouched.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "productId",
      label: "Product",
      description:
        "Which product to update — search your HubSpot product library by name, paste a product ID, or insert one from an earlier step (e.g. Create Product or Get Products).",
      type: "combobox",
      optionsSource: "hubspot:products",
      allowManualEntry: true,
      required: true,
      placeholder: "Search products or paste an ID…",
    },
    {
      name: "name",
      label: "Name",
      description: "HubSpot `name` property.",
      type: "text",
      required: false,
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
        "Unit price as a number, e.g. 99.00 — in the portal's default currency. Stored as a text string (HubSpot's required format).",
      type: "text",
      required: false,
    },
    {
      name: "hs_sku",
      label: "SKU",
      description: "HubSpot `hs_sku` property.",
      type: "text",
      required: false,
    },
    {
      name: "hs_cost_of_goods_sold",
      label: "Cost of goods sold",
      description:
        "Cost of goods sold as a number, e.g. 25.00. Stored as a text string — HubSpot's required format.",
      type: "text",
      required: false,
    },
    {
      name: "hs_recurring_billing_period",
      label: "Recurring billing period",
      description:
        "How often the product bills — pick a common period, or type any ISO 8601 duration (e.g. `P2M`). HubSpot validates server-side.",
      type: "combobox",
      allowManualEntry: true,
      required: false,
      placeholder: "P1M",
      options: [
        { value: "P1M", label: "Monthly" },
        { value: "P3M", label: "Quarterly" },
        { value: "P6M", label: "Every 6 months" },
        { value: "P1Y", label: "Yearly" },
      ],
    },
  ],
  outputs: [
    {
      name: "productId",
      type: "string",
      description: "HubSpot product id (echoed).",
    },
    {
      name: "name",
      type: "string",
      description: "Echoed `name` property (null when omitted). Marked sensitive — product names carry customer-identifying catalog data.",
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
      name: "updatedAt",
      type: "string",
      description: "ISO 8601 timestamp from HubSpot.",
    },
    {
      name: "properties",
      type: "object",
      description:
        "Full HubSpot product properties map after the update. Variable-shape. Marked sensitive — carries name + price + cost-of-goods + custom properties.",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 210,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Updates a HubSpot CRM product's properties. Supplied fields overwrite existing values; reversible only by writing the prior values back. Downstream quotes / line items referencing this product see the change.",
};
