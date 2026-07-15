import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { publishPostNow } from "@/integrations/_shared/eden/api/scheduling";
import { PublishPostNowConfigSchema } from "./publishPostNow.schema";

/**
 * `eden:publish_post_now` — immediate PUBLIC publish. High-risk, recipient-visible, irreversible.
 * The idempotency key (author-supplied or stable per-run) makes a safe retry return the SAME post
 * rather than double-posting; publication is never auto-retried with a new key.
 */
export const edenPublishPostNow: ActionHandler = async (input) => {
  const config = PublishPostNowConfigSchema.parse(input.config);
  const idempotencyKey = config.idempotencyKey ?? `eden:${input.runId}:${input.nodeId}`;
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      publishPostNow({
        accessToken,
        ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}),
        ...(config.scheduleId ? { scheduleId: config.scheduleId } : {}),
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
