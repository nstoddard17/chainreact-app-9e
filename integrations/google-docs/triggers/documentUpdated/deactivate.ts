import { channelsStop } from "@/integrations/google-drive/api/channelsStop";
import { NotFoundError } from "@/integrations/google-drive/api/errors";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";

/**
 * Google Docs `document_updated` deactivation hook — Slice 3.GDOCS-5.
 *
 * Identical shape to `newDocument/deactivate.ts` — Drive
 * `channels.stop`, best-effort on 404/410.
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
