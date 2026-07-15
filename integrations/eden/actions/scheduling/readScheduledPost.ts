import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { readScheduledPost } from "@/integrations/_shared/eden/api/schedules";
import { ReadScheduledPostConfigSchema } from "./readScheduledPost.schema";

/** `eden:read_scheduled_post` — bounded full read of one draft/scheduled post. */
export const edenReadScheduledPost: ActionHandler = async (input) => {
  const config = ReadScheduledPostConfigSchema.parse(input.config);
  const detail = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      readScheduledPost({
        accessToken,
        ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}),
        postId: config.postId,
      }),
  });
  if (!detail) {
    return {
      output: {
        found: false,
        id: null,
        status: null,
        scheduleId: null,
        timezone: null,
        platforms: [],
        scheduledFor: null,
        scheduledAtIso: null,
        text: null,
        mediaCount: 0,
        hasFirstComment: false,
        errorMessage: null,
        targets: [],
      },
    };
  }
  return {
    output: {
      found: true,
      id: detail.id,
      status: detail.status,
      scheduleId: detail.scheduleId,
      timezone: detail.timezone,
      platforms: detail.platforms,
      scheduledFor: detail.scheduledFor,
      scheduledAtIso: detail.scheduledAtIso,
      text: detail.text,
      mediaCount: detail.mediaCount,
      hasFirstComment: detail.hasFirstComment,
      errorMessage: detail.errorMessage,
      targets: detail.targets,
    },
  };
};
