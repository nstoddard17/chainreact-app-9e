import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { groupUserUpdate } from "../../api/groups/groupUserUpdate";
import { UpdateWorkspaceUserConfigSchema } from "./updateWorkspaceUser.schema";

/**
 * Power BI `update_workspace_user` action handler.
 *
 * Changes an existing principal's workspace role via
 * `PUT /groups/{workspaceId}/users` (same body semantics as Add):
 * `emailAddress` for User principals, `identifier` for Group / App
 * principals — never both.
 *
 * Output shape (downstream variable refs): { updated, accessRight }
 */
export const updateWorkspaceUser: ActionHandler = async (input) => {
  const config = UpdateWorkspaceUserConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      groupUserUpdate({
        accessToken,
        groupId: config.workspaceId,
        accessRight: config.accessRight,
        principalType: config.principalType,
        emailAddress:
          config.principalType === "User" ? config.principalEmail : undefined,
        identifier:
          config.principalType !== "User"
            ? config.principalIdentifier
            : undefined,
      }),
  });

  return {
    output: {
      updated: true,
      accessRight: config.accessRight,
    },
  };
};
