import { randomUUID } from "node:crypto";
import { buildChannelToken } from "@/integrations/_shared/google/channelToken";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { SubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import { channelsStop } from "../../api/channelsStop";
import { NotFoundError } from "../../api/errors";
import { filesWatch } from "../../api/filesWatch";

/**
 * Google Drive file_changed renewal handler.
 *
 * Called by `services/triggers/runRenewals.ts` when the row's `expiresAt`
 * is within the renewal threshold (24h). Drive's `files.watch` TTL is
 * documented as 1h-7d depending on resource; in practice Google grants
 * long expirations. The 10-min cron tick + 24h threshold gives plenty of
 * headroom either way.
 *
 * Algorithm (mirrors Calendar):
 *   1. Generate a fresh channelId + HMAC token.
 *   2. Call `files.watch` to register the new channel against the SAME
 *      `fileId` stored at activate time. (Root watches store literal
 *      "root" so renewal re-watches the user's whole drive.)
 *   3. Call `channels.stop` on the OLD channel (best-effort; ignore 404).
 *   4. Persist new channelId / resourceId / expiresAt to trigger_resources.
 *      `pageToken` survives rotation — it tracks the changes.list cursor,
 *      not the channel itself.
 *
 * Why register-new-then-stop-old: if step 3 fails, we still have a
 * working new channel. If we stopped first and the new registration
 * failed, we'd be deaf to events until the next renewal cron tick.
 */

const RENEWAL_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h

function webhookAddress(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/webhooks/google-drive`;
}

export const driveFileChangedSubscriptionHandler: SubscriptionHandler = {
  id: "google-drive:file_changed",
  canHandle(trigger) {
    return (
      trigger.provider === "google-drive" &&
      trigger.eventType === "file_changed" &&
      (trigger.config as { type?: string }).type === "subscription-watch"
    );
  },
  getRenewalThresholdMs() {
    return RENEWAL_THRESHOLD_MS;
  },
  async renew({ trigger }) {
    const config = trigger.config as {
      fileId?: string;
      channelId?: string;
      resourceId?: string;
      pageToken?: string;
    };
    const fileId = config.fileId ?? "root";
    const oldChannelId = config.channelId;
    const oldResourceId = config.resourceId;

    const integration = await getActiveForExecution(trigger.workflowAccountId!,
      trigger.provider,
      trigger.providerAccountId,
    );
    if (!integration) {
      throw new Error(
        `google-drive renew: no active integration for user ${trigger.userId}.`,
      );
    }

    // 1 + 2: register fresh channel.
    const newChannelId = `chainreact-${trigger.nodeId}-${randomUUID()}`;
    const newChannelToken = buildChannelToken({ channelId: newChannelId });

    const watch = await refreshAndRetry({
      accountId: integration.accountId,
      provider: "google-drive",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        filesWatch({
          accessToken,
          fileId,
          channelId: newChannelId,
          channelToken: newChannelToken,
          webhookAddress: webhookAddress(),
        }),
    });

    const newExpiresAt = new Date(Number(watch.expiration)).toISOString();

    // 3: best-effort stop old channel.
    if (oldChannelId && oldResourceId) {
      try {
        await refreshAndRetry({
          accountId: integration.accountId,
          provider: "google-drive",
          providerAccountId: integration.providerAccountId,
          apiCall: (accessToken) =>
            channelsStop({
              accessToken,
              channelId: oldChannelId,
              resourceId: oldResourceId,
            }),
        });
      } catch (err) {
        if (!(err instanceof NotFoundError)) {
          // Log + continue. New channel is live; old one expires naturally
          // if Google didn't accept the stop call.
          console.warn(
            JSON.stringify({
              event: "drive.watch.stop_old_channel_failed",
              triggerId: trigger.id,
              oldChannelId,
              error: (err as Error).message,
            }),
          );
        }
      }
    }

    // 4: persist new state. pageToken untouched.
    const newConfig = {
      ...config,
      channelId: newChannelId,
      resourceId: watch.resourceId,
      expiresAt: newExpiresAt,
    };
    await triggerResourcesRepo.updateConfig(trigger.id, newConfig);
  },
};
