import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { listCaptures } from "@/integrations/_shared/eden/api/content";
import { ListCapturesConfigSchema } from "./listCaptures.schema";

/** `eden:list_captures` — the workspace's web captures (one page). */
export const edenListCaptures: ActionHandler = async (input) => {
  const config = ListCapturesConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      listCaptures({
        accessToken,
        ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}),
        ...(config.status ? { status: config.status } : {}),
        ...(typeof config.limit === "number" ? { limit: config.limit } : {}),
        ...(typeof config.offset === "number" ? { offset: config.offset } : {}),
      }),
  });
  return { output: { captures: result.captures, count: result.count } };
};
