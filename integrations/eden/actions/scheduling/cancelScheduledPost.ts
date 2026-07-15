import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { cancelScheduledPost } from "@/integrations/_shared/eden/api/scheduling";
import { CancelScheduledPostConfigSchema } from "./cancelScheduledPost.schema";

/** `eden:cancel_scheduled_post` — cancel a scheduled post / delete a draft (removes it from the queue). */
export const edenCancelScheduledPost: ActionHandler = async (input) => {
  const config = CancelScheduledPostConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      cancelScheduledPost({
        accessToken,
        postId: config.postId,
        ...(config.scheduleId ? { scheduleId: config.scheduleId } : {}),
      }),
  });
  return {
    output: {
      postId: result.postId,
      status: result.status,
      cancelled: result.cancelled,
    },
  };
};
