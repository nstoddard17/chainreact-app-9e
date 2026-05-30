import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  ordersCancel,
  ordersGet,
  ordersUpdate,
  type ShopifyOrder,
} from "../../_shared/shopify/api/orders";
import { UpdateOrderStatusConfigSchema } from "./updateOrderStatus.schema";
import { resolveShopDomain } from "./_resolveShop";

/**
 * `update_order_status` Shopify action handler (Slice 12 Commit 3).
 *
 * Routes one of three sub-actions:
 *   - `cancel` → POST `/orders/{id}/cancel.json` with
 *     `email = notify_customer`, optional `reason` + `restock`.
 *   - `add_tags` → GET `/orders/{id}.json` to read existing tags,
 *     merge with the new tags (deduplicated), PUT `/orders/{id}.json`.
 *     Both calls wrapped in `refreshAndRetry` per CLAUDE.md
 *     §"OAuth 401 Handling — auxiliary calls" rule.
 *   - `add_note` → GET to read existing note, append, PUT.
 *
 * The auxiliary GET fetches use the SAME `refreshAndRetry` wrapping
 * as the principal call — a 401 on the first GET surfaces as
 * `IntegrationActionRequiredError` exactly the same as a 401 on the
 * PUT.
 */
export const updateOrderStatus: ActionHandler = async (input) => {
  const config = UpdateOrderStatusConfigSchema.parse(input.config);
  const { shopDomain, providerAccountId } = await resolveShopDomain({
    accountId: input.accountId,
    userId: input.userId,
    triggerEvent: input.triggerEvent,
  });

  let order: ShopifyOrder;
  let statusLabel: string;

  switch (config.action) {
    case "cancel": {
      order = await refreshAndRetry({
        accountId: input.accountId,
        provider: "shopify",
        providerAccountId,
        apiCall: (accessToken) =>
          ordersCancel({
            shopDomain,
            accessToken,
            orderId: config.order_id,
            notify_customer: config.notify_customer,
            reason: config.reason,
            restock: config.restock,
          }),
      });
      statusLabel = "cancelled";
      break;
    }
    case "add_tags": {
      const existing = await refreshAndRetry({
        accountId: input.accountId,
        provider: "shopify",
        providerAccountId,
        apiCall: (accessToken) =>
          ordersGet({ shopDomain, accessToken, orderId: config.order_id }),
      });
      const existingTags = (existing.tags ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const newTags = config.tags.split(",").map((t) => t.trim()).filter(Boolean);
      const merged = Array.from(new Set([...existingTags, ...newTags]));
      order = await refreshAndRetry({
        accountId: input.accountId,
        provider: "shopify",
        providerAccountId,
        apiCall: (accessToken) =>
          ordersUpdate({
            shopDomain,
            accessToken,
            orderId: config.order_id,
            fields: { tags: merged.join(", ") },
          }),
      });
      statusLabel = "tags_added";
      break;
    }
    case "add_note": {
      const existing = await refreshAndRetry({
        accountId: input.accountId,
        provider: "shopify",
        providerAccountId,
        apiCall: (accessToken) =>
          ordersGet({ shopDomain, accessToken, orderId: config.order_id }),
      });
      const existingNote = existing.note ?? "";
      const merged = existingNote
        ? `${existingNote}\n\n${config.note}`
        : config.note;
      order = await refreshAndRetry({
        accountId: input.accountId,
        provider: "shopify",
        providerAccountId,
        apiCall: (accessToken) =>
          ordersUpdate({
            shopDomain,
            accessToken,
            orderId: config.order_id,
            fields: { note: merged },
          }),
      });
      statusLabel = "note_added";
      break;
    }
  }

  return {
    output: {
      success: true,
      orderId: order.id,
      orderNumber: order.order_number ?? null,
      status: statusLabel,
      adminUrl: `https://${shopDomain}/admin/orders/${order.id}`,
      updatedAt: order.updated_at ?? null,
    },
  };
};
