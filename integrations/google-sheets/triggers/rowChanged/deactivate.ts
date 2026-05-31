import { channelsStop } from "@/integrations/google-drive/api/channelsStop";
import { NotFoundError } from "@/integrations/google-drive/api/errors";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";

/**
 * Google Sheets row_changed deactivation hook.
 *
 * Sheets watches via Drive's file-watch transport (V1 + V2 confirmed),
 * so the deactivation path imports Drive's `channelsStop` directly. Same
 * cross-provider import pattern as activate.ts; documented in the Slice
 * 5 plan doc.
 *
 * Best-effort:
 *   - 404 / 410 from Google → swallow (channel already stopped).
 *   - Other errors → propagate; lifecycle.ts logs and continues with the
 *     row deletion (the user's "disable" intent is met by deleting the
 *     trigger_resources row; provider-side cleanup is housekeeping).
 *
 * Mirrors Drive's deactivate exactly — same shape.
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
      provider: "google-sheets",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        channelsStop({
          accessToken,
          channelId: config.channelId!,
          resourceId: config.resourceId!,
        }),
    });
  } catch (err) {
    if (err instanceof NotFoundError) return; // already stopped
    throw err;
  }
};
