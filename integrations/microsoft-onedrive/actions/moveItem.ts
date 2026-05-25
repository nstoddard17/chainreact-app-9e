import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { driveItemsUpdate } from "../api/driveItemsUpdate";
import { MoveItemConfigSchema } from "./moveItem.schema";

/**
 * OneDrive `move_item` action handler.
 *
 * Subsumes V1's separate `rename_item` — pass only `newName` for an
 * in-place rename; pass only `targetParentItemId` for a move; pass
 * both for an atomic move + rename. Schema enforces at least one is
 * supplied.
 *
 * Graph performs both operations in a single PATCH; the `result`
 * reflects the final state.
 *
 * Output shape:
 *   { itemId, name, parentReference, webUrl, lastModifiedDateTime }
 */
export const moveItem: ActionHandler = async (input) => {
  const config = MoveItemConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "microsoft-onedrive"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "microsoft-onedrive",
    accountId,
    apiCall: (accessToken) =>
      driveItemsUpdate({
        accessToken,
        itemId: config.itemId,
        targetParentItemId: config.targetParentItemId,
        newName: config.newName,
      }),
  });

  return {
    output: {
      itemId: result.id,
      name: result.name ?? config.newName ?? "",
      parentReference: result.parentReference ?? null,
      webUrl: result.webUrl ?? null,
      lastModifiedDateTime: result.lastModifiedDateTime ?? null,
    },
  };
};
