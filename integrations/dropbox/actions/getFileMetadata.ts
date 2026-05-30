import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { filesGetMetadata } from "@/integrations/_shared/dropbox/api/filesGetMetadata";
import { normalizeDropboxEntry } from "@/integrations/_shared/dropbox/api/_types";
import { GetFileMetadataConfigSchema } from "./getFileMetadata.schema";

/**
 * Dropbox `get_file_metadata` — Slice 3.DROPBOX-2. Pure read; returns the
 * normalized file/folder descriptor. No bytes.
 */
export const getFileMetadata: ActionHandler = async (input) => {
  const config = GetFileMetadataConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "dropbox"
      ? input.triggerEvent.providerAccountId
      : null;

  const entry = await refreshAndRetry({
    accountId: input.accountId,
    provider: "dropbox",
    providerAccountId,
    apiCall: (accessToken) =>
      filesGetMetadata({ accessToken, path: config.path }),
  });

  const n = normalizeDropboxEntry(entry);
  return {
    output: {
      id: n.id,
      name: n.name,
      path: n.path,
      isFolder: n.isFolder,
      sizeBytes: n.sizeBytes,
      rev: n.rev,
      clientModified: n.clientModified,
      serverModified: n.serverModified,
      contentHash: n.contentHash,
    },
  };
};
