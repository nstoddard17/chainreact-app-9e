import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { searchWorkspaceItems } from "@/integrations/_shared/eden/api/items";
import { SearchItemsConfigSchema } from "./searchItems.schema";

/** `eden:search_items` — text search across workspace items (one page + cursor). */
export const edenSearchItems: ActionHandler = async (input) => {
  const config = SearchItemsConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      searchWorkspaceItems({
        accessToken,
        ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}),
        q: config.query,
        ...(config.type ? { type: config.type } : {}),
        ...(typeof config.limit === "number" ? { limit: config.limit } : {}),
        ...(config.cursor ? { cursor: config.cursor } : {}),
      }),
  });
  return {
    output: {
      items: result.items,
      count: result.count,
      totalCount: result.totalCount,
      nextCursor: result.nextCursor,
      hasMore: result.nextCursor !== null,
    },
  };
};
