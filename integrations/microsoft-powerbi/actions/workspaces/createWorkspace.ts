import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { groupCreate } from "../../api/groups/groupCreate";
import { CreateWorkspaceConfigSchema } from "./createWorkspace.schema";

/**
 * Power BI `create_workspace` action handler.
 *
 * Creates a new (V2) workspace via `POST /groups?workspaceV2=true`.
 * The connecting user becomes the workspace admin; downstream nodes chain
 * off the returned `workspaceId` (e.g. add users, assign to capacity).
 *
 * Output shape (downstream variable refs): { workspaceId, name }
 */
export const createWorkspace: ActionHandler = async (input) => {
  const config = CreateWorkspaceConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) => groupCreate({ accessToken, name: config.name }),
  });

  return {
    output: {
      workspaceId: result.id,
      name: result.name,
    },
  };
};
