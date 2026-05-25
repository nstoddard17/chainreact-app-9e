import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { driveItemsDelete } from "../api/driveItemsDelete";
import { DeleteItemConfigSchema } from "./deleteItem.schema";

/**
 * OneDrive `delete_item` action handler.
 *
 * Idempotent on 404: the wrapper throws `NotFoundError` when Graph
 * returns 404; the handler swallows and returns `{deleted: true,
 * alreadyMissing: true}` so retries after a successful first call
 * succeed without a second API call.
 *
 * Output shape:  { itemId, deleted: true, alreadyMissing: boolean }
 */
export const deleteItem: ActionHandler = async (input) => {
  const config = DeleteItemConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "microsoft-onedrive"
      ? input.triggerEvent.accountId
      : null;

  try {
    await refreshAndRetry({
      userId: input.userId,
      provider: "microsoft-onedrive",
      accountId,
      apiCall: (accessToken) =>
        driveItemsDelete({ accessToken, itemId: config.itemId }),
    });
    return {
      output: {
        itemId: config.itemId,
        deleted: true,
        alreadyMissing: false,
      },
    };
  } catch (err) {
    if (err instanceof NotFoundError) {
      return {
        output: {
          itemId: config.itemId,
          deleted: true,
          alreadyMissing: true,
        },
      };
    }
    throw err;
  }
};
