import { randomUUID } from "node:crypto";
import { buildChannelToken } from "@/integrations/_shared/google/channelToken";
import { channelsStop } from "@/integrations/google-drive/api/channelsStop";
import { NotFoundError } from "@/integrations/google-drive/api/errors";
import { filesWatch } from "@/integrations/google-drive/api/filesWatch";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { SubscriptionHandler } from "@/services/triggers/subscriptionRegistry";

/**
 * Google Sheets row_changed renewal handler.
 *
 * Called by `services/triggers/runRenewals.ts` (the existing cron
 * scheduler — no new cron job) when the row's `expiresAt` is within the
 * renewal threshold (24h).
 *
 * Algorithm mirrors Drive's renew exactly:
 *   1. Generate fresh channelId + HMAC token.
 *   2. Call Drive `files.watch` with `fileId = config.spreadsheetId`.
 *   3. Best-effort `channels.stop` on the OLD channel (404 → swallow).
 *   4. Persist new channelId / resourceId / expiresAt. The Sheets-
 *      specific config (`sheetName`, `headerRow`, `lastRowCount`,
 *      `pageToken`) survives rotation untouched.
 *
 * Why register-new-then-stop-old: if step 3 fails, we still have a
 * working new channel. If we stopped first and the new registration
 * failed, we'd be deaf to events until the next renewal cron tick.
 */

const RENEWAL_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h

function webhookAddress(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/webhooks/google-sheets`;
}

export const sheetsRowChangedSubscriptionHandler: SubscriptionHandler = {
  id: "google-sheets:row_changed",
  canHandle(trigger) {
    return (
      trigger.provider === "google-sheets" &&
      trigger.eventType === "row_changed" &&
      (trigger.config as { type?: string }).type === "subscription-watch"
    );
  },
  getRenewalThresholdMs() {
    return RENEWAL_THRESHOLD_MS;
  },
  async renew({ trigger }) {
    const config = trigger.config as {
      spreadsheetId?: string;
      channelId?: string;
      resourceId?: string;
    };
    const spreadsheetId = config.spreadsheetId;
    if (!spreadsheetId) {
      throw new Error(
        `google-sheets renew: trigger ${trigger.id} config missing spreadsheetId.`,
      );
    }
    const oldChannelId = config.channelId;
    const oldResourceId = config.resourceId;

    const integration = await getActiveForExecution(trigger.workflowAccountId!,
      trigger.provider,
      trigger.providerAccountId,
    );
    if (!integration) {
      throw new Error(
        `google-sheets renew: no active integration for user ${trigger.userId}.`,
      );
    }

    // 1 + 2: register fresh channel against the same spreadsheet.
    const newChannelId = `chainreact-${trigger.nodeId}-${randomUUID()}`;
    const newChannelToken = buildChannelToken({ channelId: newChannelId });

    const watch = await refreshAndRetry({
      accountId: integration.accountId,
      provider: "google-sheets",
      providerAccountId: integration.accountId,
      apiCall: (accessToken) =>
        filesWatch({
          accessToken,
          fileId: spreadsheetId,
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
          provider: "google-sheets",
          providerAccountId: integration.accountId,
          apiCall: (accessToken) =>
            channelsStop({
              accessToken,
              channelId: oldChannelId,
              resourceId: oldResourceId,
            }),
        });
      } catch (err) {
        if (!(err instanceof NotFoundError)) {
          // Log + continue. New channel is live; old one expires
          // naturally if Google didn't accept the stop call.
          console.warn(
            JSON.stringify({
              event: "sheets.watch.stop_old_channel_failed",
              triggerId: trigger.id,
              oldChannelId,
              error: (err as Error).message,
            }),
          );
        }
      }
    }

    // 4: persist new state. lastRowCount / sheetName / pageToken untouched.
    const newConfig = {
      ...config,
      channelId: newChannelId,
      resourceId: watch.resourceId,
      expiresAt: newExpiresAt,
    };
    await triggerResourcesRepo.updateConfig(trigger.id, newConfig);
  },
};
