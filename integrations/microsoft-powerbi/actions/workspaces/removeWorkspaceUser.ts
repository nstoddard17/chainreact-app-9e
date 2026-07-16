import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { groupUserDelete } from "../../api/groups/groupUserDelete";
import { RemoveWorkspaceUserConfigSchema } from "./removeWorkspaceUser.schema";

/**
 * Power BI `remove_workspace_user` action handler.
 *
 * Revokes a principal's access to a workspace via
 * `DELETE /groups/{workspaceId}/users/{principalIdentifier}`.
 * Destructive: the principal immediately loses its workspace role.
 *
 * Output shape (downstream variable refs): { removed, principalIdentifier }
 */
export const removeWorkspaceUser: ActionHandler = async (input) => {
  const config = RemoveWorkspaceUserConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      groupUserDelete({
        accessToken,
        groupId: config.workspaceId,
        userIdentifier: config.principalIdentifier,
      }),
  });

  return {
    output: {
      removed: true,
      principalIdentifier: config.principalIdentifier,
    },
  };
};
