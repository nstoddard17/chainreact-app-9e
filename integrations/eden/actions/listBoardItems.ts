import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { listWorkspaceItems } from "@/integrations/_shared/eden/api/items";
import { ListBoardItemsConfigSchema } from "./listBoardItems.schema";

/** `eden:list_board_items` — items on a board (one page + cursor). */
export const edenListBoardItems: ActionHandler = async (input) => {
  const config = ListBoardItemsConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      listWorkspaceItems({
        accessToken,
        ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}),
        parentId: config.boardId,
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
