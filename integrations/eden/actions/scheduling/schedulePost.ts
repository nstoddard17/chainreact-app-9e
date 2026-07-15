import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { schedulePost } from "@/integrations/_shared/eden/api/scheduling";
import { SchedulePostConfigSchema } from "./schedulePost.schema";

/**
 * `eden:schedule_post` — enqueue a public social post to auto-publish at the scheduled time.
 * High-risk: the post WILL publish publicly unless cancelled first.
 */
export const edenSchedulePost: ActionHandler = async (input) => {
  const config = SchedulePostConfigSchema.parse(input.config);
  const idempotencyKey = config.idempotencyKey ?? `eden:${input.runId}:${input.nodeId}`;
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      schedulePost({
        accessToken,
        ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}),
        ...(config.scheduleId ? { scheduleId: config.scheduleId } : {}),
        scheduledAtIso: config.scheduledAtIso,
        content: {
          ...(config.platforms ? { platforms: config.platforms } : {}),
          text: config.text,
          ...(config.segments ? { segments: config.segments } : {}),
          ...(config.media ? { media: config.media } : {}),
          ...(config.youtubeTitle ? { youtubeTitle: config.youtubeTitle } : {}),
          ...(config.timezone ? { timezone: config.timezone } : {}),
          idempotencyKey,
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
