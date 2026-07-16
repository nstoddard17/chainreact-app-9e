import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:create_line_item`.
 *
 * Mirrors `createLineItem.schema.ts` (6 fields). Required at the
 * schema layer: `dealId` + `quantity`. Handler ALSO enforces "at
 * least one of (`hs_product_id`, `name`)" — HubSpot needs a way
 * to identify the line item. The meta keeps both `hs_product_id`
 * and `name` optional so authors can pick either form; the runtime
 * validation surfaces the error if they pick neither.
 *
 * Numeric fields (`quantity`, `price`, `discount`) are TEXT —
 * HubSpot's CRM property API expects stringified numerics.
 *
 * The handler ALWAYS associates the new line item to `dealId` via
 * the v4 default-typed association (line_item → deal, type 20).
 * That's the whole purpose of a line item; failures surface as
 * `associationWarnings` (parent line item not rolled back).
 *
 * Outputs mirror `createLineItem.ts:return`.
 */
export const hubspotCreateLineItemMeta: ActionMeta = {
  key: "hubspot:create_line_item",
  provider: "hubspot",
  type: "create_line_item",
  displayName: "Create Line Item",
  description:
    "Create a HubSpot CRM line item via `/crm/v3/objects/line_items` and associate it to the supplied `dealId` (the whole purpose of a line item). Requires `dealId` + `quantity` at the schema layer; the handler ALSO requires at least one of `hs_product_id` (link an existing product) OR `name` (free-form line item). Numeric fields are stringified numerics per HubSpot's wire format. Association failures don't roll back the line item — surfaced as `associationWarnings`.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "dealId",
      label: "Deal ID",
      description:
        "The deal this line item belongs to — insert the deal ID from an earlier step (e.g. Create Deal or Get Deals).",
      type: "text",
      required: true,
      placeholder: "12345",
    },
    {
      name: "hs_product_id",
      label: "Product ID",
      description:
        "Link an existing product (Product ID) or type a one-off Name — set at least one. Insert the product ID from an earlier step (e.g. Create Product or Get Products).",
      type: "text",
      required: false,
    },
    {
      name: "name",
      label: "Name",
      description:
        "Free-form line item name when not linking a product. Set at least one of Product ID or Name.",
      type: "text",
      required: false,
      placeholder: "Custom integration setup",
    },
    {
      name: "quantity",
      label: "Quantity",
      description:
        "How many units, e.g. 1. Stored as a text string — HubSpot's required format.",
      type: "text",
      required: true,
      placeholder: "1",
    },
    {
      name: "price",
      label: "Price",
      description:
        "Unit price as a number, e.g. 99.00. HubSpot computes amount = price × quantity; omit to inherit the linked product's price.",
      type: "text",
      required: false,
      placeholder: "99.00",
    },
    {
      name: "discount",
      label: "Discount",
      description:
        "Discount amount in the portal's currency, e.g. 10. HubSpot subtracts it from the computed amount.",
      type: "text",
      required: false,
    },
  ],
  outputs: [
    {
      name: "lineItemId",
      type: "string",
      description: "HubSpot line item id. Wire downstream into `update_line_item` / `remove_line_item`.",
    },
    {
      name: "dealId",
      type: "string",
      description: "Echoed dealId — the deal this line item is associated with.",
    },
    {
      name: "productId",
      type: "string",
      description: "Echoed `hs_product_id` property (null when the line item is free-form).",
    },
    {
      name: "name",
      type: "string",
      description: "Echoed `name` property. Marked sensitive — line item names carry customer-identifying commerce detail.",
      sensitive: true,
    },
    {
      name: "quantity",
      type: "string",
      description: "Echoed `quantity` property. Marked sensitive — commerce detail.",
      sensitive: true,
    },
    {
      name: "price",
      type: "string",
      description: "Echoed `price` property (null when omitted). Marked sensitive — financial commerce data.",
      sensitive: true,
    },
    {
      name: "discount",
      type: "string",
      description: "Echoed `discount` property (null when omitted). Marked sensitive — financial commerce data.",
      sensitive: true,
    },
    {
      name: "amount",
      type: "string",
      description: "Server-computed `amount` property (price × quantity − discount). Marked sensitive — financial commerce data.",
      sensitive: true,
    },
    {
      name: "createdAt",
      type: "string",
      description: "ISO 8601 timestamp from HubSpot.",
    },
    {
      name: "properties",
      type: "object",
      description:
        "Full HubSpot line item properties map. Variable-shape. Marked sensitive — carries the full commerce detail (name + price + quantity + amount + custom properties).",
      sensitive: true,
    },
    {
      name: "associationsAttached",
      type: "array",
      description: "Per-association success report: `{toType, toId}[]` for the deal association.",
    },
    {
      name: "associationWarnings",
      type: "array",
      description: "Per-association failure report. Empty when the deal association succeeded.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 230,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a HubSpot CRM line item attached to a deal. May affect deal totals, sales reporting, and downstream quote / invoice generation.",
};
