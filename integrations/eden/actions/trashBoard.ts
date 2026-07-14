import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { trashBoard } from "@/integrations/_shared/eden/api/boards";
import { TrashBoardConfigSchema } from "./trashBoard.schema";

/** `eden:trash_board` — move a board to trash (reversible in Eden). */
export const edenTrashBoard: ActionHandler = async (input) => {
  const config = TrashBoardConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) => trashBoard({ accessToken, boardId: config.boardId }),
  });
  return { output: { boardId: result.boardId } };
};
