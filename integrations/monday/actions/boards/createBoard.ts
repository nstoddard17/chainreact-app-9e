import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { boardsCreate } from "@/integrations/_shared/monday/api/boardsCreate";
import { CreateBoardConfigSchema } from "./createBoard.schema";

/**
 * Monday `create_board` action handler — Slice 3.MONDAY-4.
 *
 * Creates a board. `boardKind` is REQUIRED (no silent default) because
 * it sets workspace-wide visibility — see the schema for the rationale.
 *
 * Output:
 *   { boardId, boardName, description, boardKind, createdAt }
 */
export const createBoard: ActionHandler = async (input) => {
  const config = CreateBoardConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.providerAccountId
      : null;

  const board = await refreshAndRetry({
    accountId: input.accountId,
    provider: "monday",
    providerAccountId,
    apiCall: (accessToken) =>
      boardsCreate({
        accessToken,
        boardName: config.boardName,
        boardKind: config.boardKind,
        description: config.description,
      }),
  });

  return {
    output: {
      boardId: board.id,
      boardName: board.name ?? config.boardName,
      description: board.description ?? config.description ?? null,
      boardKind: board.board_kind ?? config.boardKind,
      createdAt: new Date().toISOString(),
    },
  };
};
