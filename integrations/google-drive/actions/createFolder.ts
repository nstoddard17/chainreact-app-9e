import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { filesCreate } from "../api/filesCreate";
import {
  CreateFolderConfigSchema,
  type CreateFolderConfig,
} from "./createFolder.schema";

/**
 * Google Drive `files.create` (folder mimeType) action handler.
 *
 * Builds a folder metadata resource from resolved config and wraps the
 * principal API call in `refreshAndRetry` (Q3).
 *
 * accountId resolution: when the trigger fired from Google Drive, use its
 * accountId; otherwise pass null and let `refreshAndRetry` pick the user's
 * single active Drive integration.
 */
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export const createFolder: ActionHandler = async (input) => {
  const config: CreateFolderConfig = CreateFolderConfigSchema.parse(
    input.config,
  );

  const accountId =
    input.triggerEvent.provider === "google-drive"
      ? input.triggerEvent.accountId
      : null;

  const body: {
    name: string;
    mimeType: string;
    parents?: ReadonlyArray<string>;
  } = {
    name: config.name,
    mimeType: FOLDER_MIME_TYPE,
  };
  if (config.parentFolderId) {
    body.parents = [config.parentFolderId];
  }

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "google-drive",
    accountId,
    apiCall: (accessToken) => filesCreate({ accessToken, body }),
  });

  return {
    output: {
      folderId: result.id,
      name: result.name ?? config.name,
      parents: result.parents ?? [],
      webViewLink: result.webViewLink ?? null,
      createdTime: result.createdTime ?? null,
    },
  };
};
