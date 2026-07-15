import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { saveLinksToBoard } from "@/integrations/_shared/eden/api/boards";
import { SaveLinksToBoardConfigSchema } from "./saveLinksToBoard.schema";

/** `eden:save_links_to_board` — save URLs onto a board. */
export const edenSaveLinksToBoard: ActionHandler = async (input) => {
  const config = SaveLinksToBoardConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      saveLinksToBoard({ accessToken, ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}), boardId: config.boardId, urls: config.urls }),
  });
  return { output: { boardId: result.boardId, itemsCreated: result.itemsCreated, itemsSkipped: result.itemsSkipped } };
};
