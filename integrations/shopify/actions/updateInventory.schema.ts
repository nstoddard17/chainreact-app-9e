import { z } from "zod";

/**
 * `update_inventory` action schema (Slice 12 Commit 3).
 *
 * V1 reference: [`lib/workflows/actions/shopify/updateInventory.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/updateInventory.ts).
 *
 * Three modes via the `adjustment_type` discriminator:
 *   - `set` → Shopify's `/inventory_levels/set.json` with the absolute
 *     quantity. `quantity` MUST be non-negative.
 *   - `add` → `/inventory_levels/adjust.json` with positive delta.
 *     `quantity` non-negative.
 *   - `subtract` → `/inventory_levels/adjust.json` with negative
 *     delta. `quantity` non-negative — the handler negates it before
 *     sending to Shopify.
 *
 * `inventory_item_id` and `location_id` are numeric (Shopify's REST
 * resource IDs). The schema accepts string-or-number for ergonomic
 * input from upstream variable references that may produce strings.
 *
 * No Q11 gate.
 */
export const UpdateInventoryConfigSchema = z
  .object({
    inventory_item_id: z.union([
      z.string().min(1),
      z.number().int().positive(),
    ]),
    location_id: z.union([z.string().min(1), z.number().int().positive()]),
    adjustment_type: z.enum(["set", "add", "subtract"]),
    quantity: z.number().int().min(0),
  })
  .strict();

export type UpdateInventoryConfig = z.infer<typeof UpdateInventoryConfigSchema>;
