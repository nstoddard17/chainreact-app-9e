import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { itemsMove } from "@/integrations/_shared/monday/api/itemsMove";
import { MoveItemConfigSchema } from "./moveItem.schema";

/**
 * Monday `move_item` action handler — Slice 3.MONDAY-2.
 *
 * Moves an item between groups within (or across) a board via
 * Monday's `move_item_to_group` mutation. Monday does NOT expose the
 * source group in the response — workflow authors who need it must
 * fetch the item before calling and stash the source group id.
 *
 * Output shape:
 *   {
 *     itemId: string,
 *     itemName: string | null,
 *     boardId: string,
 *     targetGroupId: string,
 *     targetGroupTitle: string | null,
 *     movedAt: string
 *   }
 */
export const moveItem: ActionHandler = async (input) => {
  const config = MoveItemConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.accountId
      : null;

  const moved = await refreshAndRetry({
    userId: input.userId,
    provider: "monday",
    accountId,
    apiCall: (accessToken) =>
      itemsMove({
        accessToken,
        itemId: config.itemId,
        targetGroupId: config.targetGroupId,
      }),
  });

  return {
    output: {
      itemId: moved.id,
      itemName: moved.name ?? null,
      boardId: config.boardId,
      targetGroupId: moved.group?.id ?? config.targetGroupId,
      targetGroupTitle: moved.group?.title ?? null,
      movedAt: new Date().toISOString(),
    },
  };
};
