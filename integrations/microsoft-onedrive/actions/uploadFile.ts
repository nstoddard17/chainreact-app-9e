import { Buffer } from "node:buffer";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { driveItemsContentUpload } from "../api/driveItemsContentUpload";
import {
  UploadFileConfigSchema,
  type UploadFileConfig,
} from "./uploadFile.schema";

/**
 * OneDrive `upload_file` action handler.
 *
 * Algorithm:
 *   1. Schema parse (Zod strict, defaults contentEncoding to "utf8").
 *   2. Decode content per encoding into a Buffer.
 *   3. PUT /me/drive/items/{parent}:/{filename}:/content (or
 *      /me/drive/root:/{filename}:/content) via refreshAndRetry.
 *   4. 4 MB cap is enforced inside `driveItemsContentUpload` — the
 *      wrapper throws a clear "exceeded" error and refreshAndRetry
 *      propagates verbatim (size-cap failures aren't 401-shaped).
 *
 * Output shape (downstream variable refs):
 *   { itemId, name, size, mimeType, webUrl, downloadUrl,
 *     parentReference, createdDateTime, lastModifiedDateTime }
 */
export const uploadFile: ActionHandler = async (input) => {
  const config: UploadFileConfig = UploadFileConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-onedrive"
      ? input.triggerEvent.providerAccountId
      : null;

  const content =
    config.contentEncoding === "base64"
      ? Buffer.from(config.content, "base64")
      : Buffer.from(config.content, "utf8");

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-onedrive",
    providerAccountId,
    apiCall: (accessToken) =>
      driveItemsContentUpload({
        accessToken,
        parentItemId: config.parentItemId,
        filename: config.filename,
        mimeType: config.mimeType,
        content,
      }),
  });

  return {
    output: {
      itemId: result.id,
      name: result.name ?? config.filename,
      size: result.size ?? null,
      mimeType: result.file?.mimeType ?? config.mimeType,
      webUrl: result.webUrl ?? null,
      downloadUrl: result["@microsoft.graph.downloadUrl"] ?? null,
      parentReference: result.parentReference ?? null,
      createdDateTime: result.createdDateTime ?? null,
      lastModifiedDateTime: result.lastModifiedDateTime ?? null,
    },
  };
};
