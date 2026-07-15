import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { listHighlights } from "@/integrations/_shared/eden/api/content";
import { ListHighlightsConfigSchema } from "./listHighlights.schema";

/** `eden:list_highlights` — the account's saved highlights (one page). */
export const edenListHighlights: ActionHandler = async (input) => {
  const config = ListHighlightsConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      listHighlights({
        accessToken,
        ...(typeof config.limit === "number" ? { limit: config.limit } : {}),
        ...(typeof config.offset === "number" ? { offset: config.offset } : {}),
        ...(config.orderBy ? { orderBy: config.orderBy } : {}),
      }),
  });
  return { output: { highlights: result.highlights, count: result.count } };
};
