import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { boardsGet } from "@/integrations/_shared/monday/api/boardsGet";
import { NotFoundError } from "@/integrations/_shared/monday/errors";
import { GetBoardConfigSchema } from "./getBoard.schema";

/**
 * Monday `get_board` action handler — Slice 3.MONDAY-4.
 *
 * Pure read. Fetches a board's metadata + its columns + groups. Throws
 * NotFoundError when the board doesn't exist.
 *
 * Output:
 *   { boardId, boardName, description, boardKind, state, updatedAt,
 *     creatorId, creatorName, columns[], groups[], columnCount, groupCount }
 */
export const getBoard: ActionHandler = async (input) => {
  const config = GetBoardConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.providerAccountId
      : null;

  const board = await refreshAndRetry({
    accountId: input.accountId,
    provider: "monday",
    providerAccountId,
    apiCall: (accessToken) =>
      boardsGet({ accessToken, boardId: config.boardId }),
  });

  if (board === null) {
    throw new NotFoundError(`board ${config.boardId}`);
  }

  const columns = board.columns.map((c) => ({
    columnId: c.id,
    title: c.title ?? null,
    type: c.type ?? null,
  }));
  const groups = board.groups.map((g) => ({
    groupId: g.id,
    title: g.title ?? null,
    color: g.color ?? null,
  }));

  return {
    output: {
      boardId: board.id,
      boardName: board.name ?? null,
      description: board.description ?? null,
      boardKind: board.board_kind ?? null,
      state: board.state ?? null,
      updatedAt: board.updated_at ?? null,
      creatorId: board.creator?.id ?? null,
      creatorName: board.creator?.name ?? null,
      columns,
      groups,
      columnCount: columns.length,
      groupCount: groups.length,
    },
  };
};
