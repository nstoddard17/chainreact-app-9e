import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { getPrompt } from "@/integrations/_shared/eden/api/library";
import { GetPromptConfigSchema } from "./getPrompt.schema";

/** `eden:get_prompt` — a saved prompt/skill's full definition. */
export const edenGetPrompt: ActionHandler = async (input) => {
  const config = GetPromptConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) => getPrompt({ accessToken, promptId: config.promptId }),
  });
  return {
    output: {
      id: result.id,
      title: result.title,
      summary: result.summary,
      description: result.description,
      category: result.category,
      systemPrompt: result.systemPrompt,
      toolsEnabled: result.toolsEnabled,
      usesVoiceProfile: result.usesVoiceProfile,
    },
  };
};
