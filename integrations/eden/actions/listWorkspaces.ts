import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { listWorkspaces } from "@/integrations/_shared/eden/api/workspaces";
import { ListWorkspacesConfigSchema } from "./listWorkspaces.schema";

/** `eden:list_workspaces` — the connected account's workspaces + default. */
export const edenListWorkspaces: ActionHandler = async (input) => {
  ListWorkspacesConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) => listWorkspaces({ accessToken }),
  });
  return {
    output: {
      workspaces: result.workspaces,
      defaultWorkspaceId: result.defaultWorkspaceId,
      count: result.workspaces.length,
    },
  };
};
