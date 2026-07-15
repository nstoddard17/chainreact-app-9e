import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { resolveCreator } from "@/integrations/_shared/eden/api/creators";
import { ResolveCreatorConfigSchema } from "./resolveCreator.schema";

/** `eden:resolve_creator` — resolve a handle/query to bounded creator profiles. */
export const edenResolveCreator: ActionHandler = async (input) => {
  const config = ResolveCreatorConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      resolveCreator({
        accessToken,
        query: config.query,
        ...(config.platform ? { platform: config.platform } : {}),
        ...(typeof config.limit === "number" ? { limit: config.limit } : {}),
      }),
  });
  return { output: { creators: result.creators, count: result.creators.length } };
};
