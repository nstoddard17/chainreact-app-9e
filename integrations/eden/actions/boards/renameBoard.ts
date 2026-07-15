import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { renameBoard } from "@/integrations/_shared/eden/api/boards";
import { RenameBoardConfigSchema } from "./renameBoard.schema";

/** `eden:rename_board` — change a board's name. */
export const edenRenameBoard: ActionHandler = async (input) => {
  const config = RenameBoardConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) => renameBoard({ accessToken, boardId: config.boardId, name: config.name }),
  });
  return { output: { boardId: result.boardId, name: result.name } };
};
