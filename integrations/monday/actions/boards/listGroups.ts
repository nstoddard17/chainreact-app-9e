import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { groupsList } from "@/integrations/_shared/monday/api/groupsList";
import { NotFoundError } from "@/integrations/_shared/monday/errors";
import { ListGroupsConfigSchema } from "./listGroups.schema";

/**
 * Monday `list_groups` action handler — Slice 3.MONDAY-4.
 *
 * Pure read. Lists a board's groups with full detail (color / position /
 * archived). Reuses the shared `groupsList` wrapper (extended in
 * MONDAY-4 with the detail fields; the MONDAY-3 `monday:groups` resolver
 * reads only id/title from the same wrapper).
 *
 * `boardFound=false` (Monday returns an empty boards array for an
 * unknown / inaccessible board id) → NotFoundError, matching the other
 * single-board reads (get_board).
 *
 * Output:
 *   { boardId, groups[], count }
 */
export const listGroups: ActionHandler = async (input) => {
  const config = ListGroupsConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "monday",
    accountId,
    apiCall: (accessToken) =>
      groupsList({ accessToken, boardId: config.boardId }),
  });

  if (!result.boardFound) {
    throw new NotFoundError(`board ${config.boardId}`);
  }

  const groups = result.groups.map((g) => ({
    groupId: g.id,
    title: g.title ?? null,
    color: g.color ?? null,
    position: g.position ?? null,
    archived: g.archived ?? null,
  }));

  return {
    output: {
      boardId: config.boardId,
      groups,
      count: groups.length,
    },
  };
};
