import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { listPrompts } from "@/integrations/_shared/eden/api/library";
import { ListPromptsConfigSchema } from "./listPrompts.schema";

/** `eden:list_prompts` — saved prompts & skills in a workspace. */
export const edenListPrompts: ActionHandler = async (input) => {
  const config = ListPromptsConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) => listPrompts({ accessToken, ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}) }),
  });
  return { output: { prompts: result.prompts, count: result.prompts.length } };
};
