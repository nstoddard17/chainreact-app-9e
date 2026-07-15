import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { listScheduledPosts } from "@/integrations/_shared/eden/api/schedules";
import { ListScheduledPostsConfigSchema } from "./listScheduledPosts.schema";

/** `eden:list_scheduled_posts` — one page of queued/sent posts. */
export const edenListScheduledPosts: ActionHandler = async (input) => {
  const config = ListScheduledPostsConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      listScheduledPosts({
        accessToken,
        ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}),
        ...(config.scheduleId ? { scheduleId: config.scheduleId } : {}),
        ...(config.status ? { status: config.status } : {}),
        ...(typeof config.limit === "number" ? { limit: config.limit } : {}),
      }),
  });
  return {
    output: {
      posts: result.posts,
      count: result.count,
      mode: result.mode,
    },
  };
};
