import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { itemsDelete } from "@/integrations/_shared/monday/api/itemsDelete";
import { DeleteItemConfigSchema } from "./deleteItem.schema";

/**
 * Monday `delete_item` action handler — Slice 3.MONDAY-2.
 *
 * Soft-deletes an item via Monday's `delete_item` mutation. Items
 * move to the workspace recycle bin and remain UI-restorable.
 *
 * Per D-MON4 (destructive trio), the output is STRUCTURAL ONLY — we
 * never echo the deleted item's name, body, or column values. This
 * keeps the success signal observable in downstream workflow steps
 * while honoring the "minimize destructive-action data leakage"
 * principle.
 *
 * Output shape (structural only):
 *   {
 *     success: true,
 *     deletedItemId: string,
 *     deletedAt: string
 *   }
 */
export const deleteItem: ActionHandler = async (input) => {
  const config = DeleteItemConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.accountId
      : null;

  const deleted = await refreshAndRetry({
    userId: input.userId,
    provider: "monday",
    accountId,
    apiCall: (accessToken) =>
      itemsDelete({
        accessToken,
        itemId: config.itemId,
      }),
  });

  return {
    output: {
      success: true,
      deletedItemId: deleted.id,
      deletedAt: new Date().toISOString(),
    },
  };
};
