import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `shopify:update_inventory` — Slice 4.SHOPIFY-META-2.
 * Mirrors `updateInventory.schema.ts`. `adjustment_type` selects set vs
 * add vs subtract; `quantity` is non-negative (the handler negates it for
 * subtract). No Q11 gate. Inventory changes affect storefront availability,
 * so this is a medium-risk write.
 *
 * RESOLVERS-2 — the two id fields diverge deliberately:
 *   - `location_id` → `shopify:locations` combobox. Locations are a small,
 *     stable, listable set of static provider resources (`GET
 *     /locations.json`, `read_locations` — added to the manifest's OPTIONAL
 *     scopes). A merchant should never hand-copy one.
 *   - `inventory_item_id` stays TEXT — a justified **dynamic upstream
 *     value**, not a usability gap. An inventory item is a variant's
 *     invisible inventory record: it has no name, no SKU of its own, and no
 *     merchant-facing identity anywhere in the Shopify admin UI, and Shopify
 *     exposes NO standalone list endpoint for it (`/inventory_items.json`
 *     requires an `ids=` filter you can only obtain from variants you
 *     already have). The only labels a synthetic picker could show would be
 *     the parent variant's — i.e. the `shopify:variants` picker wearing a
 *     different id, which would silently mis-target if a merchant picked the
 *     variant they wanted while the field expects the inventory item. The
 *     real path is mapping `{{step.inventoryItemId}}` from an upstream
 *     Update / Create Product Variant step (both emit it) or a product
 *     trigger, which is what the description now says.
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
      label: "Inventory Item",
      description:
        "The inventory item to adjust. Map this from an earlier step's `inventoryItemId` output (Update Product Variant / Create Product Variant both produce it), or type a Shopify inventory item id.",
      type: "text",
      required: true,
      placeholder: "{{step.inventoryItemId}}",
    },
    {
      name: "location_id",
      label: "Location",
      description:
        "Which store location the inventory is tracked at. Pick one of your store's locations, map a location id from an earlier step, or type a Shopify location id.",
      type: "combobox",
      optionsSource: "shopify:locations",
      allowManualEntry: true,
      required: true,
      placeholder: "Search locations or type an id",
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
