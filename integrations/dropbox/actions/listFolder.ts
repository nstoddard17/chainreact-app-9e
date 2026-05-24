import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { filesListFolder } from "@/integrations/_shared/dropbox/api/filesListFolder";
import { normalizeDropboxEntry } from "@/integrations/_shared/dropbox/api/_types";
import { ListFolderConfigSchema } from "./listFolder.schema";

/**
 * Dropbox `list_folder` — Slice 3.DROPBOX-2. Lists a folder's entries
 * (root = `""`). Surfaces Dropbox's `cursor` + `hasMore` so workflows can
 * paginate via a follow-up call with the same cursor.
 *
 * Output: `{ entries, count, cursor, hasMore }`.
 */
export const listFolder: ActionHandler = async (input) => {
  const config = ListFolderConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "dropbox"
      ? input.triggerEvent.accountId
      : null;

  const res = await refreshAndRetry({
    userId: input.userId,
    provider: "dropbox",
    accountId,
    apiCall: (accessToken) =>
      filesListFolder({
        accessToken,
        path: config.path,
        recursive: config.recursive,
        ...(config.limit !== undefined && { limit: config.limit }),
        ...(config.cursor !== undefined && { cursor: config.cursor }),
      }),
  });

  const entries = res.entries.map(normalizeDropboxEntry);
  return {
    output: {
      entries,
      count: entries.length,
      cursor: res.cursor,
      hasMore: res.has_more,
    },
  };
};
