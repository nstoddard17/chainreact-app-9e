import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { boardsDuplicate } from "@/integrations/_shared/monday/api/boardsDuplicate";
import { DuplicateBoardConfigSchema } from "./duplicateBoard.schema";

/**
 * Monday `duplicate_board` action handler — Slice 3.MONDAY-4.
 *
 * Clones a board. `duplicateType` controls how much is copied
 * (structure-only default — see schema).
 *
 * Output:
 *   { newBoardId, newBoardName, originalBoardId, description, boardKind, createdAt }
 */
export const duplicateBoard: ActionHandler = async (input) => {
  const config = DuplicateBoardConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.providerAccountId
      : null;

  const newBoard = await refreshAndRetry({
    accountId: input.accountId,
    provider: "monday",
    providerAccountId,
    apiCall: (accessToken) =>
      boardsDuplicate({
        accessToken,
        boardId: config.boardId,
        duplicateType: config.duplicateType,
        boardName: config.newBoardName,
      }),
  });

  return {
    output: {
      newBoardId: newBoard.id,
      newBoardName: newBoard.name ?? null,
      originalBoardId: config.boardId,
      description: newBoard.description ?? null,
      boardKind: newBoard.board_kind ?? null,
      createdAt: new Date().toISOString(),
    },
  };
};
