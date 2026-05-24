import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { filesMove } from "@/integrations/_shared/dropbox/api/filesMove";
import { normalizeDropboxEntry } from "@/integrations/_shared/dropbox/api/_types";
import { MoveFileConfigSchema } from "./moveFile.schema";

/**
 * Dropbox `move_file` — Slice 3.DROPBOX-2. Moves/renames a file or folder.
 * Medium risk (recoverable). Output: `{ id, name, path, isFolder }`.
 */
export const moveFile: ActionHandler = async (input) => {
  const config = MoveFileConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "dropbox"
      ? input.triggerEvent.accountId
      : null;

  const entry = await refreshAndRetry({
    userId: input.userId,
    provider: "dropbox",
    accountId,
    apiCall: (accessToken) =>
      filesMove({
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
