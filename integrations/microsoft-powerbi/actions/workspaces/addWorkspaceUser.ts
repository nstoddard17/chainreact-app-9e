import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { groupUserAdd } from "../../api/groups/groupUserAdd";
import { AddWorkspaceUserConfigSchema } from "./addWorkspaceUser.schema";

/**
 * Power BI `add_workspace_user` action handler.
 *
 * Grants a principal a role on a workspace via
 * `POST /groups/{workspaceId}/users`. Builds the documented body per
 * principal type: `emailAddress` for User principals, `identifier`
 * (Entra object id) for Group / App principals — never both.
 *
 * Output shape (downstream variable refs): { granted, accessRight }
 */
export const addWorkspaceUser: ActionHandler = async (input) => {
  const config = AddWorkspaceUserConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      groupUserAdd({
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
      granted: true,
      accessRight: config.accessRight,
    },
  };
};
