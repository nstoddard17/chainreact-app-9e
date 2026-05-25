import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  inventoryLevelsAdjust,
  inventoryLevelsSet,
  type ShopifyInventoryLevel,
} from "../../_shared/shopify/api/inventoryLevels";
import { UpdateInventoryConfigSchema } from "./updateInventory.schema";
import { resolveShopDomain } from "./_resolveShop";

/**
 * `update_inventory` Shopify action handler (Slice 12 Commit 3).
 *
 * Routes by `adjustment_type`:
 *   - `set` → POST `/inventory_levels/set.json` (absolute value).
 *   - `add` → POST `/inventory_levels/adjust.json` with positive delta.
 *   - `subtract` → POST `/inventory_levels/adjust.json` with negative
 *     delta. The schema's `quantity` is non-negative; the handler
 *     negates here before sending.
 */
export const updateInventory: ActionHandler = async (input) => {
  const config = UpdateInventoryConfigSchema.parse(input.config);
  const { shopDomain, accountId } = await resolveShopDomain({
    userId: input.userId,
    triggerEvent: input.triggerEvent,
  });

  const inventoryItemId = Number(config.inventory_item_id);
  const locationId = Number(config.location_id);

  let level: ShopifyInventoryLevel;
  if (config.adjustment_type === "set") {
    level = await refreshAndRetry({
      userId: input.userId,
      provider: "shopify",
      accountId,
      apiCall: (accessToken) =>
        inventoryLevelsSet({
          shopDomain,
          accessToken,
          inventory_item_id: inventoryItemId,
          location_id: locationId,
          available: config.quantity,
        }),
    });
  } else {
    const delta =
      config.adjustment_type === "add" ? config.quantity : -config.quantity;
    level = await refreshAndRetry({
      userId: input.userId,
      provider: "shopify",
      accountId,
      apiCall: (accessToken) =>
        inventoryLevelsAdjust({
          shopDomain,
          accessToken,
          inventory_item_id: inventoryItemId,
          location_id: locationId,
          available_adjustment: delta,
        }),
    });
  }

  return {
    output: {
      success: true,
      inventoryItemId: level.inventory_item_id,
      locationId: level.location_id,
      newQuantity: level.available,
      updatedAt: level.updated_at ?? null,
    },
  };
};
