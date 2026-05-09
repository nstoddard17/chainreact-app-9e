import { shopifyRequest } from "./_request";

/**
 * Shopify Admin REST `/inventory_levels` resource wrappers.
 *
 * Slice 12 Commit 3. Covers `update_inventory`. Two distinct
 * endpoints depending on the user's `adjustment_type`:
 *
 *   - `set` → POST `/inventory_levels/set.json` body
 *     `{ inventory_item_id, location_id, available }` — overwrites the
 *     current quantity to the given value.
 *   - `add` / `subtract` → POST `/inventory_levels/adjust.json` body
 *     `{ inventory_item_id, location_id, available_adjustment }` —
 *     positive delta for `add`, negative for `subtract`.
 *
 * V1's [`updateInventory.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/updateInventory.ts)
 * routes the same way; V2 keeps the same wire shape but moves the
 * routing decision into the action handler so each wrapper is
 * single-purpose.
 */

// ─── Wire-format response types ─────────────────────────────────────────────

export interface ShopifyInventoryLevel {
  inventory_item_id: number;
  location_id: number;
  available: number | null;
  updated_at?: string;
}

interface ShopifyInventoryLevelResponse {
  inventory_level: ShopifyInventoryLevel;
}

// ─── inventoryLevelsSet ─────────────────────────────────────────────────────

export interface InventoryLevelsSetInput {
  shopDomain: string;
  accessToken: string;
  inventory_item_id: number;
  location_id: number;
  available: number;
}

export async function inventoryLevelsSet(
  input: InventoryLevelsSetInput,
): Promise<ShopifyInventoryLevel> {
  const response = await shopifyRequest<ShopifyInventoryLevelResponse>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    method: "POST",
    path: "/inventory_levels/set.json",
    body: {
      inventory_item_id: input.inventory_item_id,
      location_id: input.location_id,
      available: input.available,
    },
    resourceForNotFound: `inventory_item ${input.inventory_item_id} at location ${input.location_id}`,
  });
  return response.inventory_level;
}

// ─── inventoryLevelsAdjust ──────────────────────────────────────────────────

export interface InventoryLevelsAdjustInput {
  shopDomain: string;
  accessToken: string;
  inventory_item_id: number;
  location_id: number;
  /**
   * Positive integer to add stock; negative to remove. The action
   * handler maps `adjustment_type=add → +quantity`, `subtract →
   * -quantity` before calling.
   */
  available_adjustment: number;
}

export async function inventoryLevelsAdjust(
  input: InventoryLevelsAdjustInput,
): Promise<ShopifyInventoryLevel> {
  const response = await shopifyRequest<ShopifyInventoryLevelResponse>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    method: "POST",
    path: "/inventory_levels/adjust.json",
    body: {
      inventory_item_id: input.inventory_item_id,
      location_id: input.location_id,
      available_adjustment: input.available_adjustment,
    },
    resourceForNotFound: `inventory_item ${input.inventory_item_id} at location ${input.location_id}`,
  });
  return response.inventory_level;
}
