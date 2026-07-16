import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { groupUpdate } from "../../api/groups/groupUpdate";
import { UpdateWorkspaceConfigSchema } from "./updateWorkspace.schema";

/**
 * Power BI `update_workspace` action handler.
 *
 * Renames a workspace and/or updates its description via
 * `PATCH /groups/{workspaceId}`. Only the provided fields are sent.
 *
 * Output shape (downstream variable refs): { updated, workspaceId }
 */
export const updateWorkspace: ActionHandler = async (input) => {
  const config = UpdateWorkspaceConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      groupUpdate({
        accessToken,
        groupId: config.workspaceId,
        name: config.name,
        description: config.description,
      }),
  });

  return {
    output: {
      updated: true,
      workspaceId: config.workspaceId,
    },
  };
};
