import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { readBoard } from "@/integrations/_shared/eden/api/boards";
import { ReadBoardConfigSchema } from "./readBoard.schema";

/** `eden:read_board` — a bounded summary (counts) of a board. */
export const edenReadBoard: ActionHandler = async (input) => {
  const config = ReadBoardConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      readBoard({ accessToken, ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}), itemId: config.itemId }),
  });
  return {
    output: {
      boardId: result.boardId,
      title: result.title,
      itemCount: result.itemCount,
      stickyNoteCount: result.stickyNoteCount,
      textBlockCount: result.textBlockCount,
    },
  };
};
