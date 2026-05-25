import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { updatesList } from "@/integrations/_shared/monday/api/updatesList";
import { NotFoundError } from "@/integrations/_shared/monday/errors";
import { ListUpdatesConfigSchema } from "./listUpdates.schema";

/**
 * Monday `list_updates` action handler — Slice 3.MONDAY-4.
 *
 * Pure read. Lists the updates (comments) on an item. Update bodies are
 * sensitive — surfaced because reading them is the action's purpose,
 * but never logged. Throws NotFoundError when the item doesn't exist.
 *
 * Output:
 *   { itemId, itemName, updates[], count }
 */
export const listUpdates: ActionHandler = async (input) => {
  const config = ListUpdatesConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "monday",
    accountId,
    apiCall: (accessToken) =>
      updatesList({
        accessToken,
        itemId: config.itemId,
        limit: config.limit,
      }),
  });

  if (result === null) {
    throw new NotFoundError(`item ${config.itemId}`);
  }

  const updates = result.updates.map((u) => ({
    updateId: u.id,
    body: u.text_body ?? null,
    creatorId: u.creator?.id ?? null,
    creatorName: u.creator?.name ?? null,
    createdAt: u.created_at ?? null,
    updatedAt: u.updated_at ?? null,
  }));

  return {
    output: {
      itemId: result.itemId,
      itemName: result.itemName ?? null,
      updates,
      count: updates.length,
    },
  };
};
