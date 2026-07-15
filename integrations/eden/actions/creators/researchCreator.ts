import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { analyzeCreator } from "@/integrations/_shared/eden/api/creators";
import { ResearchCreatorConfigSchema } from "./researchCreator.schema";

/**
 * `eden:research_creator` — profile + aggregate performance for a creator. Surfaces `indexingStatus`
 * so a workflow branches on "still indexing" rather than blocking; never waits in a loop.
 */
export const edenResearchCreator: ActionHandler = async (input) => {
  const config = ResearchCreatorConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      analyzeCreator({
        accessToken,
        query: config.query,
        ...(config.platform ? { platform: config.platform } : {}),
        ...(typeof config.topPostLimit === "number" ? { topPostLimit: config.topPostLimit } : {}),
        ...(config.since ? { since: config.since } : {}),
        ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}),
      }),
  });
  return {
    output: {
      creator: result.creator,
      metrics: result.metrics,
      indexingStatus: result.indexingStatus,
      indexedPostCount: result.indexedPostCount,
    },
  };
};
