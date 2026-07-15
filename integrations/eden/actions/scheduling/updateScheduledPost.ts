import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { updateScheduledPost } from "@/integrations/_shared/eden/api/scheduling";
import { UpdateScheduledPostConfigSchema } from "./updateScheduledPost.schema";

/** `eden:update_scheduled_post` — edit a draft/scheduled post's content (reversible pre-publish). */
export const edenUpdateScheduledPost: ActionHandler = async (input) => {
  const config = UpdateScheduledPostConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      updateScheduledPost({
        accessToken,
        postId: config.postId,
        ...(config.scheduleId ? { scheduleId: config.scheduleId } : {}),
        content: {
          ...(config.platforms ? { platforms: config.platforms } : {}),
          ...(config.text !== undefined ? { text: config.text } : {}),
          ...(config.segments ? { segments: config.segments } : {}),
          ...(config.media ? { media: config.media } : {}),
          ...(config.youtubeTitle ? { youtubeTitle: config.youtubeTitle } : {}),
        },
      }),
  });
  return {
    output: {
      id: result.id,
      status: result.status,
      scheduleId: result.scheduleId,
      timezone: result.timezone,
      platforms: result.platforms,
      scheduledFor: result.scheduledFor,
      scheduledAtIso: result.scheduledAtIso,
      targets: result.targets,
    },
  };
};
