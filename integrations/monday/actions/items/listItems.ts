import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { itemsList } from "@/integrations/_shared/monday/api/itemsList";
import { ListItemsConfigSchema } from "./listItems.schema";

/**
 * Monday `list_items` action handler — Slice 3.MONDAY-2.
 *
 * Pure read. Lists items on a board with cursor-style pagination.
 * Optional `groupId` filters client-side after fetch (matches V1's
 * approach — Monday doesn't expose a group filter on items_page).
 *
 * Output shape:
 *   {
 *     items: [{ itemId, itemName, state, boardId, boardName, groupId,
 *               groupTitle, columnValues, createdAt, updatedAt,
 *               creatorId, creatorName }],
 *     count,
 *     boardId,
 *     boardName,
 *     groupId,
 *     hasMore,
 *     nextCursor
 *   }
 */
export const listItems: ActionHandler = async (input) => {
  const config = ListItemsConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.accountId
      : null;

  const page = await refreshAndRetry({
    userId: input.userId,
    provider: "monday",
    accountId,
    apiCall: (accessToken) =>
      itemsList({
        accessToken,
        boardId: config.boardId,
        limit: config.limit,
        cursor: config.cursor ?? null,
      }),
  });

  // Optional client-side group filter — matches V1's behavior.
  const filtered = config.groupId
    ? page.items.filter((it) => it.group?.id === config.groupId)
    : page.items;

  const normalized = filtered.map((it) => ({
    itemId: it.id,
    itemName: it.name ?? null,
    state: it.state ?? null,
    boardId: it.board?.id ?? config.boardId,
    boardName: it.board?.name ?? null,
    groupId: it.group?.id ?? null,
    groupTitle: it.group?.title ?? null,
    columnValues: it.column_values.map((cv) => ({
      id: cv.id,
      title: cv.column?.title ?? cv.id,
      type: cv.type ?? null,
      text: cv.text ?? null,
      value: cv.value ?? null,
    })),
    createdAt: it.created_at ?? null,
    updatedAt: it.updated_at ?? null,
    creatorId: it.creator?.id ?? null,
    creatorName: it.creator?.name ?? null,
  }));

  return {
    output: {
      items: normalized,
      count: normalized.length,
      boardId: page.board?.id ?? config.boardId,
      boardName: page.board?.name ?? null,
      groupId: config.groupId ?? null,
      hasMore: page.cursor !== null,
      nextCursor: page.cursor,
    },
  };
};
