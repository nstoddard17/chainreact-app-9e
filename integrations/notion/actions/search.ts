import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { search as notionSearch } from "../api/search";
import { SearchConfigSchema } from "./search.schema";

/**
 * Notion `search` action handler.
 *
 * Returns paginated search results from Notion's `/v1/search` endpoint.
 * Search hits include both pages and databases the integration has
 * access to; the optional `filter` narrows by object type.
 *
 * Output shape (downstream variable refs):
 *   { results, hasMore, nextCursor }
 *   - `results` is the raw Notion search hit array (each hit carries
 *     `object: "page" | "database"`, `id`, `url`, `parent`, etc.).
 *   - Workflows that need typed property values on page-shaped hits
 *     should chain `get_page` to fetch the full page; this action
 *     surfaces the search-list shape as-is.
 */
export const search: ActionHandler = async (input) => {
  const config = SearchConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "notion"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "notion",
    providerAccountId,
    apiCall: (accessToken) =>
      notionSearch({
        accessToken,
        query: config.query,
        filter: config.filter,
        pageSize: config.pageSize,
        startCursor: config.startCursor,
      }),
  });

  return {
    output: {
      results: result.results,
      hasMore: result.has_more,
      nextCursor: result.next_cursor,
    },
  };
};
