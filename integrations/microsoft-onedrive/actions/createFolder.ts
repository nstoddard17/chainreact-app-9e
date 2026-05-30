import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { driveItemsCreateFolder } from "../api/driveItemsCreateFolder";
import { CreateFolderConfigSchema } from "./createFolder.schema";

/**
 * OneDrive `create_folder` action handler.
 *
 * Wrapper sets `conflictBehavior: "fail"` per Q11 (no silent
 * overwrite or rename). Workflow authors who want rename-on-conflict
 * compose this with a `find_item` step (deferred) or handle the error.
 *
 * Output shape (downstream variable refs):
 *   { itemId, name, webUrl, parentReference, childCount, createdDateTime,
 *     lastModifiedDateTime }
 */
export const createFolder: ActionHandler = async (input) => {
  const config = CreateFolderConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-onedrive"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-onedrive",
    providerAccountId,
    apiCall: (accessToken) =>
      driveItemsCreateFolder({
        accessToken,
        parentItemId: config.parentItemId,
        name: config.name,
      }),
  });

  return {
    output: {
      itemId: result.id,
      name: result.name ?? config.name,
      webUrl: result.webUrl ?? null,
      parentReference: result.parentReference ?? null,
      childCount: result.folder?.childCount ?? 0,
      createdDateTime: result.createdDateTime ?? null,
      lastModifiedDateTime: result.lastModifiedDateTime ?? null,
    },
  };
};
