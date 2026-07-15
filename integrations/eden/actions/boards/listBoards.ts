import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { listBoards } from "@/integrations/_shared/eden/api/boards";
import { ListBoardsConfigSchema } from "./listBoards.schema";

/** `eden:list_boards` — boards (canvases) in a workspace (one page + cursor). */
export const edenListBoards: ActionHandler = async (input) => {
  const config = ListBoardsConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      listBoards({
        accessToken,
        ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}),
        ...(typeof config.limit === "number" ? { limit: config.limit } : {}),
        ...(config.cursor ? { cursor: config.cursor } : {}),
      }),
  });
  return {
    output: {
      boards: result.items,
      totalCount: result.totalCount,
      nextCursor: result.nextCursor,
      hasMore: result.nextCursor !== null,
    },
  };
};
