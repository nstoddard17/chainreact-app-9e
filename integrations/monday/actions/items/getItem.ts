import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { itemsGet } from "@/integrations/_shared/monday/api/itemsGet";
import { NotFoundError } from "@/integrations/_shared/monday/errors";
import { GetItemConfigSchema } from "./getItem.schema";

/**
 * Monday `get_item` action handler — Slice 3.MONDAY-2.
 *
 * Pure read. Fetches one item by id with normalized output shape.
 * Throws `NotFoundError` when Monday returns an empty items array
 * (item missing or no access).
 *
 * Output shape:
 *   {
 *     itemId, itemName, state,
 *     boardId, boardName,
 *     groupId, groupTitle,
 *     columnValues: [{ id, title, type, text, value }],
 *     createdAt, updatedAt,
 *     creatorId, creatorName
 *   }
 *
 * Note: column_values are normalized so each row carries a flat
 * `title` derived from the nested `column.title` field (Monday's
 * API 2024-01 doesn't expose `title` directly on column_values).
 */
export const getItem: ActionHandler = async (input) => {
  const config = GetItemConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.providerAccountId
      : null;

  const item = await refreshAndRetry({
    accountId: input.accountId,
    provider: "monday",
    providerAccountId,
    apiCall: (accessToken) =>
      itemsGet({
        accessToken,
        itemId: config.itemId,
      }),
  });

  if (item === null) {
    throw new NotFoundError(`item ${config.itemId}`);
  }

  const columnValues = item.column_values.map((cv) => ({
    id: cv.id,
    title: cv.column?.title ?? cv.id,
    type: cv.type ?? null,
    text: cv.text ?? null,
    value: cv.value ?? null,
  }));

  return {
    output: {
      itemId: item.id,
      itemName: item.name ?? null,
      state: item.state ?? null,
      boardId: item.board?.id ?? config.boardId,
      boardName: item.board?.name ?? null,
      groupId: item.group?.id ?? null,
      groupTitle: item.group?.title ?? null,
      columnValues,
      createdAt: item.created_at ?? null,
      updatedAt: item.updated_at ?? null,
      creatorId: item.creator?.id ?? null,
      creatorName: item.creator?.name ?? null,
    },
  };
};
