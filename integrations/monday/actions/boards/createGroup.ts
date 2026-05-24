import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { groupsCreate } from "@/integrations/_shared/monday/api/groupsCreate";
import { CreateGroupConfigSchema } from "./createGroup.schema";

/**
 * Monday `create_group` action handler — Slice 3.MONDAY-4.
 *
 * Adds a group to a board.
 *
 * Output:
 *   { groupId, groupTitle, groupColor, boardId, createdAt }
 */
export const createGroup: ActionHandler = async (input) => {
  const config = CreateGroupConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.accountId
      : null;

  const group = await refreshAndRetry({
    userId: input.userId,
    provider: "monday",
    accountId,
    apiCall: (accessToken) =>
      groupsCreate({
        accessToken,
        boardId: config.boardId,
        groupTitle: config.groupTitle,
        color: config.color,
      }),
  });

  return {
    output: {
      groupId: group.id,
      groupTitle: group.title ?? config.groupTitle,
      groupColor: group.color ?? null,
      boardId: config.boardId,
      createdAt: new Date().toISOString(),
    },
  };
};
