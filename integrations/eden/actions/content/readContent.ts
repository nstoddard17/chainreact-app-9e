import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { readCard } from "@/integrations/_shared/eden/api/content";
import { ReadContentConfigSchema } from "./readContent.schema";

/** `eden:read_content` — read a social post by URL (content metadata + optional transcript). */
export const edenReadContent: ActionHandler = async (input) => {
  const config = ReadContentConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      readCard({
        accessToken,
        url: config.url,
        includeTranscript: config.includeTranscript,
        ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}),
      }),
  });
  return {
    output: {
      status: result.status,
      platform: result.platform,
      contentId: result.contentId,
      post: result.post,
    },
  };
};
