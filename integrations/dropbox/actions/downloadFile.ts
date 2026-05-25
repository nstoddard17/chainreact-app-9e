import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { stageFileToStorage } from "@/services/files/stageFileToStorage";
import { filesDownload } from "@/integrations/_shared/dropbox/api/filesDownload";
import { normalizeDropboxEntry } from "@/integrations/_shared/dropbox/api/_types";
import { DownloadFileConfigSchema } from "./downloadFile.schema";

/**
 * Dropbox `download_file` — Slice 3.DROPBOX-2 (FileRef producer).
 *
 * Downloads bytes from Dropbox's content host and stages them into V2
 * storage, returning a `FileRef(kind=v2_storage, provider="dropbox")`.
 * Mirrors `monday:download_file` / Slack download — durable staged ref
 * for cross-provider chains; bytes NEVER enter the action output (V2
 * replaces V1's base64-inline antipattern).
 *
 * Dropbox doesn't return a MIME type, so the staged ref uses
 * `application/octet-stream` (the file name preserves the extension).
 *
 * Output: `{ file: FileRef(v2_storage), name, path, sizeBytes, rev }`.
 */
export const downloadFile: ActionHandler = async (input) => {
  const config = DownloadFileConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "dropbox"
      ? input.triggerEvent.accountId
      : null;

  const { bytes, metadata } = await refreshAndRetry({
    userId: input.userId,
    provider: "dropbox",
    accountId,
    apiCall: (accessToken) =>
      filesDownload({ accessToken, path: config.path }),
  });

  const n = normalizeDropboxEntry(metadata);
  const fileName =
    n.name ?? config.path.split("/").filter(Boolean).pop() ?? "dropbox-file";
  const mimeType = "application/octet-stream";

  const staged = await stageFileToStorage({
    userId: input.userId,
    workflowId: input.workflowId,
    runId: input.runId,
    nodeId: input.nodeId,
    fileName,
    mimeType,
    bytes,
    ...(n.sizeBytes !== null && { sizeBytes: n.sizeBytes }),
    provider: "dropbox",
    metadata: {
      ...(n.path !== null && { path: n.path }),
      ...(n.rev !== null && { rev: n.rev }),
    },
  });

  return {
    output: {
      file: staged.ref,
      name: fileName,
      path: n.path,
      sizeBytes: bytes.byteLength,
      rev: n.rev,
    },
  };
};
