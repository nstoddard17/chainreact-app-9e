import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { filesCreateFolder } from "@/integrations/_shared/dropbox/api/filesCreateFolder";
import { normalizeDropboxEntry } from "@/integrations/_shared/dropbox/api/_types";
import { CreateFolderConfigSchema } from "./createFolder.schema";

/**
 * Dropbox `create_folder` — Slice 3.DROPBOX-2. Medium risk. Output:
 * `{ id, name, path }`.
 */
export const createFolder: ActionHandler = async (input) => {
  const config = CreateFolderConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "dropbox"
      ? input.triggerEvent.accountId
      : null;

  const entry = await refreshAndRetry({
    userId: input.userId,
    provider: "dropbox",
    accountId,
    apiCall: (accessToken) =>
      filesCreateFolder({
        accessToken,
        path: config.path,
        autorename: config.autorename,
      }),
  });

  const n = normalizeDropboxEntry(entry);
  return {
    output: { id: n.id, name: n.name, path: n.path },
  };
};
