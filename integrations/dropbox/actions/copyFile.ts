import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { filesCopy } from "@/integrations/_shared/dropbox/api/filesCopy";
import { normalizeDropboxEntry } from "@/integrations/_shared/dropbox/api/_types";
import { CopyFileConfigSchema } from "./copyFile.schema";

/**
 * Dropbox `copy_file` — Slice 3.DROPBOX-2. Copies a file or folder.
 * Medium risk. Output: `{ id, name, path, isFolder }`.
 */
export const copyFile: ActionHandler = async (input) => {
  const config = CopyFileConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "dropbox"
      ? input.triggerEvent.accountId
      : null;

  const entry = await refreshAndRetry({
    userId: input.userId,
    provider: "dropbox",
    accountId,
    apiCall: (accessToken) =>
      filesCopy({
        accessToken,
        fromPath: config.fromPath,
        toPath: config.toPath,
        autorename: config.autorename,
      }),
  });

  const n = normalizeDropboxEntry(entry);
  return {
    output: { id: n.id, name: n.name, path: n.path, isFolder: n.isFolder },
  };
};
