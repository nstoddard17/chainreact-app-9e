import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { subitemsList } from "@/integrations/_shared/monday/api/subitemsList";
import { NotFoundError } from "@/integrations/_shared/monday/errors";
import { ListSubitemsConfigSchema } from "./listSubitems.schema";

/**
 * Monday `list_subitems` action handler — Slice 3.MONDAY-4.
 *
 * Pure read. Lists the subitems of a parent item. Throws NotFoundError
 * when the parent item doesn't exist.
 *
 * Output:
 *   { parentItemId, parentItemName, subitems[], count }
 *   Each subitem normalized with flat column titles.
 */
export const listSubitems: ActionHandler = async (input) => {
  const config = ListSubitemsConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "monday",
    providerAccountId,
    apiCall: (accessToken) =>
      subitemsList({ accessToken, parentItemId: config.parentItemId }),
  });

  if (result === null) {
    throw new NotFoundError(`item ${config.parentItemId}`);
  }

  const subitems = result.subitems.map((s) => ({
    subitemId: s.id,
    subitemName: s.name ?? null,
    state: s.state ?? null,
    boardId: s.board?.id ?? null,
    boardName: s.board?.name ?? null,
    columnValues: s.column_values.map((cv) => ({
      id: cv.id,
      title: cv.column?.title ?? cv.id,
      type: cv.type ?? null,
      text: cv.text ?? null,
      value: cv.value ?? null,
    })),
    createdAt: s.created_at ?? null,
    updatedAt: s.updated_at ?? null,
  }));

  return {
    output: {
      parentItemId: result.parentItemId,
      parentItemName: result.parentItemName ?? null,
      subitems,
      count: subitems.length,
    },
  };
};
