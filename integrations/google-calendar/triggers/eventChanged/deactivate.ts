import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";
import { channelsStop } from "../../api/channelsStop";
import { NotFoundError } from "../../api/errors";

/**
 * Google Calendar event_changed deactivation hook.
 *
 * Runs at workflow-disable / delete time, BEFORE the trigger_resources row
 * is removed. Calls `channels.stop` so Google stops POSTing notifications
 * to our webhook.
 *
 * Best-effort:
 *   - 404 / 410 from Google → swallow (channel already stopped or
 *     never existed; desired state achieved).
 *   - Other errors → propagate to lifecycle.ts, which logs and continues
 *     with the row deletion (the user's "disable" action means the row
 *     deletion; provider-side cleanup is housekeeping).
 */
export const deactivate: DeactivationFn = async ({ trigger, integration }) => {
  const config = trigger.config as {
    channelId?: string;
    resourceId?: string;
    type?: string;
  };

  // Defense: only act on subscription-watch rows. A row tagged differently
  // would be a misconfiguration; nothing to stop here.
  if (config.type !== "subscription-watch") return;
  if (!config.channelId || !config.resourceId) return;

  try {
    await refreshAndRetry({
      accountId: integration.accountId,
      provider: "google-calendar",
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
