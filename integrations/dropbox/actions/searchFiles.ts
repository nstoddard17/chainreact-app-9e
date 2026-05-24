import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { filesSearch } from "@/integrations/_shared/dropbox/api/filesSearch";
import { normalizeDropboxEntry } from "@/integrations/_shared/dropbox/api/_types";
import { SearchFilesConfigSchema } from "./searchFiles.schema";

/**
 * Dropbox `search_files` — Slice 3.DROPBOX-2. Searches `query`,
 * optionally scoped to a folder `path`. Returns normalized matches.
 *
 * Output: `{ matches, count, hasMore, cursor }`.
 */
export const searchFiles: ActionHandler = async (input) => {
  const config = SearchFilesConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "dropbox"
      ? input.triggerEvent.accountId
      : null;

  const res = await refreshAndRetry({
    userId: input.userId,
    provider: "dropbox",
    accountId,
    apiCall: (accessToken) =>
      filesSearch({
        accessToken,
        query: config.query,
        ...(config.path !== undefined && { path: config.path }),
        ...(config.maxResults !== undefined && {
          maxResults: config.maxResults,
        }),
      }),
  });

  const matches = res.entries.map(normalizeDropboxEntry);
  return {
    output: {
      matches,
      count: matches.length,
      hasMore: res.hasMore,
      cursor: res.cursor,
    },
  };
};
