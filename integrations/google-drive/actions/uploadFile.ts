import { Buffer } from "node:buffer";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { filesCreateMultipart } from "../api/filesCreateMultipart";
import {
  UploadFileConfigSchema,
  type UploadFileConfig,
} from "./uploadFile.schema";

/**
 * Google Drive `files.create` (multipart upload) action handler.
 *
 * Builds the metadata + content from resolved config, decodes the content
 * into raw bytes per `contentEncoding`, and wraps the principal upload
 * call in `refreshAndRetry` (Q3).
 *
 * 25 MB cap is enforced inside `filesCreateMultipart` — the wrapper
 * throws a clear "exceeded" error and refreshAndRetry propagates verbatim
 * (no retry on size-cap failures, which aren't 401-shaped).
 */
export const uploadFile: ActionHandler = async (input) => {
  const config: UploadFileConfig = UploadFileConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "google-drive"
      ? input.triggerEvent.accountId
      : null;

  const content =
    config.contentEncoding === "base64"
      ? Buffer.from(config.content, "base64")
      : Buffer.from(config.content, "utf8");

  const metadata: {
    name: string;
    mimeType: string;
    parents?: ReadonlyArray<string>;
  } = {
    name: config.filename,
    mimeType: config.mimeType,
  };
  if (config.parentFolderId) {
    metadata.parents = [config.parentFolderId];
  }

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "google-drive",
    accountId,
    apiCall: (accessToken) =>
      filesCreateMultipart({ accessToken, metadata, content }),
  });

  return {
    output: {
      fileId: result.id,
      name: result.name ?? config.filename,
      mimeType: result.mimeType ?? config.mimeType,
      parents: result.parents ?? [],
      webViewLink: result.webViewLink ?? null,
      size: (result as { size?: string }).size ?? null,
      createdTime: result.createdTime ?? null,
    },
  };
};
