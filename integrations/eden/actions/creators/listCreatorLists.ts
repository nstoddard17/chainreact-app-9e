import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { listCreatorLists } from "@/integrations/_shared/eden/api/creators";
import { ListCreatorListsConfigSchema } from "./listCreatorLists.schema";

/** `eden:list_creator_lists` — the workspace's creator lists. */
export const edenListCreatorLists: ActionHandler = async (input) => {
  const config = ListCreatorListsConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) => listCreatorLists({ accessToken, ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}) }),
  });
  return { output: { lists: result.lists, count: result.count } };
};
