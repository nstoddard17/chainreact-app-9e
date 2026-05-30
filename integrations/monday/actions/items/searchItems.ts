import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { itemsList } from "@/integrations/_shared/monday/api/itemsList";
import { itemsSearchByColumnValues } from "@/integrations/_shared/monday/api/itemsSearchByColumnValues";
import type { MondayItemFull } from "@/integrations/_shared/monday/api/itemsGet";
import { SearchItemsConfigSchema } from "./searchItems.schema";

/**
 * Monday `search_items` action handler — Slice 3.MONDAY-4.
 *
 * Two search modes (matches V1):
 *   - With `columnId`: exact column-value match via
 *     `items_page_by_column_values`.
 *   - Without `columnId`: fetch the board's items and client-side
 *     substring-filter by item name.
 * Optional `groupId` further filters the result set client-side.
 *
 * Pure read. Output:
 *   { items[], count, columnValue, boardId, groupId }
 *   Each item normalized like get_item / list_items (flat column titles).
 */

function normalizeItem(it: MondayItemFull) {
  return {
    itemId: it.id,
    itemName: it.name ?? null,
    state: it.state ?? null,
    boardId: it.board?.id ?? null,
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
  };
}

export const searchItems: ActionHandler = async (input) => {
  const config = SearchItemsConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.providerAccountId
      : null;

  let rawItems: MondayItemFull[];
  if (config.columnId !== undefined) {
    const result = await refreshAndRetry({
      accountId: input.accountId,
      provider: "monday",
      providerAccountId,
      apiCall: (accessToken) =>
        itemsSearchByColumnValues({
          accessToken,
          boardId: config.boardId,
          columnId: config.columnId!,
          columnValue: config.columnValue,
          limit: config.limit,
        }),
    });
    rawItems = result.items;
  } else {
    // Name-search path — fetch board items and substring-filter.
    const result = await refreshAndRetry({
      accountId: input.accountId,
      provider: "monday",
      providerAccountId,
      apiCall: (accessToken) =>
        itemsList({
          accessToken,
          boardId: config.boardId,
          limit: config.limit,
        }),
    });
    const needle = config.columnValue.toLowerCase();
    rawItems = result.items.filter((it) =>
      (it.name ?? "").toLowerCase().includes(needle),
    );
  }

  // Optional group filter (client-side) — matches V1.
  const filtered = config.groupId
    ? rawItems.filter((it) => it.group?.id === config.groupId)
    : rawItems;

  const items = filtered.map(normalizeItem);

  return {
    output: {
      items,
      count: items.length,
      columnValue: config.columnValue,
      boardId: config.boardId,
      groupId: config.groupId ?? null,
    },
  };
};
