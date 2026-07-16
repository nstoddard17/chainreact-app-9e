import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:update_line_item`.
 *
 * Mirrors `updateLineItem.schema.ts`: `lineItemId` (required) + 4
 * property fields (all optional). Handler enforces "at least one
 * property field must be present" at runtime.
 *
 * NO association re-binding — relinking a line item to a different
 * deal is a separate flow (V1 + V2 don't ship it on update).
 *
 * Outputs mirror `updateLineItem.ts:return`.
 */
export const hubspotUpdateLineItemMeta: ActionMeta = {
  key: "hubspot:update_line_item",
  provider: "hubspot",
  type: "update_line_item",
  displayName: "Update Line Item",
  description:
    "Update a HubSpot CRM line item via `/crm/v3/objects/line_items/{id}`. Requires the line item id and at least one property field — runtime rejects empty updates. Numeric fields are stringified numerics. Association re-binding (changing the parent deal) is NOT handled here.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "lineItemId",
      label: "Line item ID",
      description:
        "Which line item to update — insert the line item ID from an earlier step (e.g. Create Line Item or Get Line Items).",
      type: "text",
      required: true,
      placeholder: "12345",
    },
    {
      name: "name",
      label: "Name",
      description: "HubSpot `name` property — free-form line item name.",
      type: "text",
      required: false,
    },
    {
      name: "quantity",
      label: "Quantity",
      description:
        "How many units, e.g. 1. Stored as a text string — HubSpot's required format.",
      type: "text",
      required: false,
    },
    {
      name: "price",
      label: "Price",
      description:
        "Unit price as a number, e.g. 99.00. HubSpot recomputes the amount server-side.",
      type: "text",
      required: false,
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
      description: "HubSpot line item id (echoed).",
    },
    {
      name: "name",
      type: "string",
      description: "Echoed `name` property (null when omitted). Marked sensitive — commerce detail.",
      sensitive: true,
    },
    {
      name: "quantity",
      type: "string",
      description: "Echoed `quantity` property (null when omitted). Marked sensitive — commerce detail.",
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
      description: "Server-recomputed `amount` property after the update. Marked sensitive — financial commerce data.",
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
        "Full HubSpot line item properties map after the update. Variable-shape. Marked sensitive — carries commerce detail (name + price + quantity + amount + custom properties).",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 240,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Updates a HubSpot CRM line item's properties. Supplied fields overwrite existing values; may change the parent deal's total and downstream sales reporting / quote / invoice numbers.",
};
