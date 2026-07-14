import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { createBoard } from "@/integrations/_shared/eden/api/boards";
import { CreateBoardConfigSchema } from "./createBoard.schema";

/** `eden:create_board` — create a board in a workspace. */
export const edenCreateBoard: ActionHandler = async (input) => {
  const config = CreateBoardConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      createBoard({ accessToken, ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}), title: config.title }),
  });
  return {
    output: {
      boardId: result.boardId,
      title: result.title,
      workspaceId: result.workspaceId,
    },
  };
};
