import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { itemsDuplicate } from "@/integrations/_shared/monday/api/itemsDuplicate";
import { DuplicateItemConfigSchema } from "./duplicateItem.schema";

/**
 * Monday `duplicate_item` action handler — Slice 3.MONDAY-4.
 *
 * Clones an item within its board via `duplicate_item`. `withUpdates`
 * controls whether the source item's updates (comments) are copied.
 *
 * Output:
 *   { newItemId, newItemName, originalItemId, boardId, groupId, createdAt }
 */
export const duplicateItem: ActionHandler = async (input) => {
  const config = DuplicateItemConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.providerAccountId
      : null;

  const newItem = await refreshAndRetry({
    accountId: input.accountId,
    provider: "monday",
    providerAccountId,
    apiCall: (accessToken) =>
      itemsDuplicate({
        accessToken,
        boardId: config.boardId,
        itemId: config.itemId,
        withUpdates: config.withUpdates,
      }),
  });

  return {
    output: {
      newItemId: newItem.id,
      newItemName: newItem.name ?? null,
      originalItemId: config.itemId,
      boardId: newItem.board?.id ?? config.boardId,
      groupId: newItem.group?.id ?? null,
      createdAt: newItem.created_at ?? null,
    },
  };
};
