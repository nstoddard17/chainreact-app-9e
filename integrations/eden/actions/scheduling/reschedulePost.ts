import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { updateScheduledPost } from "@/integrations/_shared/eden/api/scheduling";
import { ReschedulePostConfigSchema } from "./reschedulePost.schema";

/** `eden:reschedule_post` — move a post's publish time (content unchanged; reversible pre-publish). */
export const edenReschedulePost: ActionHandler = async (input) => {
  const config = ReschedulePostConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      updateScheduledPost({
        accessToken,
        postId: config.postId,
        ...(config.scheduleId ? { scheduleId: config.scheduleId } : {}),
        scheduledAtIso: config.scheduledAtIso,
        ...(config.timezone ? { timezone: config.timezone } : {}),
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
