import { channelsStop } from "@/integrations/google-drive/api/channelsStop";
import { NotFoundError } from "@/integrations/google-drive/api/errors";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";

/**
 * Google Sheets `new_worksheet` deactivation hook.
 *
 * Mirrors `rowChanged/deactivate.ts` exactly — same Drive watch
 * transport, same channelsStop best-effort cleanup. Kept as a
 * separate file (rather than a shared helper) so each trigger
 * directory stays self-contained per V2 provider conventions.
 *
 * Best-effort: 404/410 from Google → swallow (channel already
 * stopped). Other errors propagate; lifecycle.ts logs + continues
 * with the trigger_resources row deletion.
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
      providerAccountId: integration.accountId,
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
