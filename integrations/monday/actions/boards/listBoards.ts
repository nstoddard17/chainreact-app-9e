import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { boardsList } from "@/integrations/_shared/monday/api/boardsList";
import { ListBoardsConfigSchema } from "./listBoards.schema";

/**
 * Monday `list_boards` action handler — Slice 3.MONDAY-2.
 *
 * Pure read. Lists boards visible to the authenticated user.
 *
 * Pagination — `cursor` is a stringified 1-based page index. The
 * shared `boardsList` wrapper uses Monday's page-based pagination
 * under the hood; we normalize to a `cursor` field so downstream
 * pagination UX is uniform with `list_items`. When the page returns
 * fewer items than `limit`, `hasMore` is false and `nextCursor` is
 * null.
 *
 * Output shape:
 *   {
 *     boards: [{ boardId, name, description, boardKind, state,
 *                updatedAt, creatorId, creatorName }],
 *     count,
 *     hasMore,
 *     nextCursor
 *   }
 */
export const listBoards: ActionHandler = async (input) => {
  const config = ListBoardsConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.providerAccountId
      : null;

  const currentPage = config.cursor
    ? parsePageOrThrow(config.cursor)
    : 1;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "monday",
    providerAccountId,
    apiCall: (accessToken) =>
      boardsList({
        accessToken,
        limit: config.limit,
        page: currentPage,
      }),
  });

  const normalized = result.boards.map((b) => ({
    boardId: b.id,
    name: b.name ?? null,
    description: b.description ?? null,
    boardKind: b.board_kind ?? null,
    state: b.state ?? null,
    updatedAt: b.updated_at ?? null,
    creatorId: b.creator?.id ?? null,
    creatorName: b.creator?.name ?? null,
  }));

  // Page-based pagination — when the page is full, assume there may
  // be more. When the page is short, there isn't.
  const hasMore = normalized.length === config.limit;
  const nextCursor = hasMore ? String(currentPage + 1) : null;

  return {
    output: {
      boards: normalized,
      count: normalized.length,
      hasMore,
      nextCursor,
    },
  };
};

function parsePageOrThrow(cursor: string): number {
  const page = Number.parseInt(cursor, 10);
  if (!Number.isFinite(page) || page < 1) {
    throw new Error(
      "list_boards: cursor must be a stringified positive integer (page index).",
    );
  }
  return page;
}
