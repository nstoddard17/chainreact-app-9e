import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `shopify:update_inventory` — Slice 4.SHOPIFY-META-2.
 * Mirrors `updateInventory.schema.ts`. `adjustment_type` selects set vs
 * add vs subtract; `quantity` is non-negative (the handler negates it for
 * subtract). No Q11 gate. Inventory changes affect storefront availability,
 * so this is a medium-risk write.
 */
export const shopifyUpdateInventoryMeta: ActionMeta = {
  key: "shopify:update_inventory",
  provider: "shopify",
  type: "update_inventory",
  displayName: "Update Inventory",
  description:
    "Set or adjust the available quantity of an inventory item at a location. `set` writes an absolute quantity; `add` / `subtract` apply a delta. Quantity is always a non-negative number (the direction comes from the adjustment type).",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "inventory_item_id",
      label: "Inventory Item ID",
      description:
        "The Shopify inventory item id (available from a variant's `inventoryItemId` output).",
      type: "text",
      required: true,
      placeholder: "808950810",
    },
    {
      name: "location_id",
      label: "Location ID",
      description: "The Shopify location id where inventory is tracked.",
      type: "text",
      required: true,
      placeholder: "905684977",
    },
    {
      name: "adjustment_type",
      label: "Adjustment Type",
      description: "How the quantity is applied.",
      type: "select",
      required: true,
      options: [
        { value: "set", label: "Set to (absolute)" },
        { value: "add", label: "Add (increase)" },
        { value: "subtract", label: "Subtract (decrease)" },
      ],
    },
    {
      name: "quantity",
      label: "Quantity",
      description:
        "Non-negative quantity. For `set` it's the absolute level; for `add` / `subtract` it's the unsigned delta.",
      type: "number",
      required: true,
      numeric: { min: 0, integer: true },
    },
  ],
  outputs: [
    { name: "success", type: "boolean", description: "True when inventory was updated." },
    { name: "inventoryItemId", type: "string", description: "The inventory item id updated." },
    { name: "locationId", type: "string", description: "The location id updated." },
    { name: "newQuantity", type: "number", description: "Resulting available quantity at the location." },
    { name: "updatedAt", type: "string", description: "ISO timestamp of the update." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 110,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Changes storefront availability; can oversell/undersell if misconfigured. Recoverable external write.",
};
