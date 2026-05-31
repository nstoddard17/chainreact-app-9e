import { channelsStop } from "@/integrations/google-drive/api/channelsStop";
import { NotFoundError } from "@/integrations/google-drive/api/errors";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";

/**
 * Google Docs `new_document` deactivation hook — Slice 3.GDOCS-5.
 *
 * Mirrors `google-drive/triggers/fileChanged/deactivate.ts` exactly —
 * the watch is a Drive channel; cleanup uses Drive's `channels.stop`.
 * Best-effort: 404/410 from Google → swallow (channel already
 * stopped); other errors → propagate to lifecycle.ts which logs +
 * continues with the trigger_resources row deletion.
 */
export const deactivate: DeactivationFn = async ({ trigger, integration }) => {
  const config = trigger.config as {
    channelId?: string;
    resourceId?: string;
    type?: string;
  };

  if (config.type !== "subscription-watch") return;
  if (!config.channelId || !config.resourceId) return;

  try {
    await refreshAndRetry({
      accountId: integration.accountId,
      provider: "google-docs",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        channelsStop({
          accessToken,
          channelId: config.channelId!,
          resourceId: config.resourceId!,
        }),
    });
  } catch (err) {
    if (err instanceof NotFoundError) return;
    throw err;
  }
};
