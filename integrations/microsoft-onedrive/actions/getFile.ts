import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { driveItemsGet } from "../api/driveItemsGet";
import { GetFileConfigSchema } from "./getFile.schema";

/**
 * OneDrive `get_file` action handler.
 *
 * Returns the DriveItem metadata for both files and folders — V1's
 * `findItemById` rebadging is collapsed into this one action. Workflow
 * authors who specifically want a folder still get a useful payload
 * (mimeType is null for folders; the `kind` field discriminates).
 *
 * `downloadUrl` is Graph's short-lived (~1h) pre-signed URL. Folders
 * return `downloadUrl: null`. Workflow authors fetch the URL promptly
 * in a follow-up node when they need the bytes.
 *
 * Output shape (downstream variable refs):
 *   { itemId, name, kind: "file" | "folder", size, mimeType, webUrl,
 *     downloadUrl, parentReference, createdDateTime,
 *     lastModifiedDateTime }
 */
export const getFile: ActionHandler = async (input) => {
  const config = GetFileConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-onedrive"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-onedrive",
    providerAccountId,
    apiCall: (accessToken) =>
      driveItemsGet({ accessToken, itemId: config.itemId }),
  });

  return {
    output: {
      itemId: result.id,
      name: result.name ?? "",
      kind: result.folder ? "folder" : result.file ? "file" : "file",
      size: result.size ?? null,
      mimeType: result.file?.mimeType ?? null,
      webUrl: result.webUrl ?? null,
      downloadUrl: result["@microsoft.graph.downloadUrl"] ?? null,
      parentReference: result.parentReference ?? null,
      createdDateTime: result.createdDateTime ?? null,
      lastModifiedDateTime: result.lastModifiedDateTime ?? null,
    },
  };
};
