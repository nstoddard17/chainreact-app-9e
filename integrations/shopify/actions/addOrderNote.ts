import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { ordersGet, ordersUpdate } from "../../_shared/shopify/api/orders";
import { AddOrderNoteConfigSchema } from "./addOrderNote.schema";
import { resolveShopDomain } from "./_resolveShop";

/**
 * `add_order_note` Shopify action handler (Slice 12 Commit 3).
 *
 * `append=true` flow:
 *   1. GET `/orders/{id}.json` (auxiliary; refreshAndRetry-wrapped).
 *   2. PUT `/orders/{id}.json` with `note` set to existing + new
 *      separated by a blank line. Empty existing note → just the new
 *      note (no leading blank lines).
 *
 * `append=false` flow:
 *   1. PUT `/orders/{id}.json` with the new note overwriting the
 *      existing one. No GET — single round trip.
 *
 * No customer-facing email is sent on either path (no Q11 gate).
 */
export const addOrderNote: ActionHandler = async (input) => {
  const config = AddOrderNoteConfigSchema.parse(input.config);
  const { shopDomain, accountId } = await resolveShopDomain({
    userId: input.userId,
    triggerEvent: input.triggerEvent,
  });

  let finalNote: string;
  if (config.append) {
    const existing = await refreshAndRetry({
      userId: input.userId,
      provider: "shopify",
      accountId,
      apiCall: (accessToken) =>
        ordersGet({ shopDomain, accessToken, orderId: config.order_id }),
    });
    const existingNote = existing.note ?? "";
    finalNote = existingNote ? `${existingNote}\n\n${config.note}` : config.note;
  } else {
    finalNote = config.note;
  }

  const order = await refreshAndRetry({
    userId: input.userId,
    provider: "shopify",
    accountId,
    apiCall: (accessToken) =>
      ordersUpdate({
        shopDomain,
        accessToken,
        orderId: config.order_id,
        fields: { note: finalNote },
      }),
  });

  return {
    output: {
      success: true,
      orderId: order.id,
      note: order.note ?? finalNote,
      updatedAt: order.updated_at ?? null,
    },
  };
};
