import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { createSchedulingDraft } from "@/integrations/_shared/eden/api/scheduling";
import { CreateSchedulingDraftConfigSchema } from "./createSchedulingDraft.schema";

/** `eden:create_scheduling_draft` — create a scheduling draft (reversible; never publishes). */
export const edenCreateSchedulingDraft: ActionHandler = async (input) => {
  const config = CreateSchedulingDraftConfigSchema.parse(input.config);
  const idempotencyKey = config.idempotencyKey ?? `eden:${input.runId}:${input.nodeId}`;
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      createSchedulingDraft({
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
