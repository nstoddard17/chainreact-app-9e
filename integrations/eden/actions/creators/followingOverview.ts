import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { followingOverview } from "@/integrations/_shared/eden/api/creators";
import { FollowingOverviewConfigSchema } from "./followingOverview.schema";

/** `eden:following_overview` — who the account follows (bounded). */
export const edenFollowingOverview: ActionHandler = async (input) => {
  const config = FollowingOverviewConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      followingOverview({
        accessToken,
        ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}),
        ...(config.platform ? { platform: config.platform } : {}),
        ...(typeof config.limit === "number" ? { limit: config.limit } : {}),
      }),
  });
  return { output: { totalFollowedCount: result.totalFollowedCount, follows: result.follows } };
};
