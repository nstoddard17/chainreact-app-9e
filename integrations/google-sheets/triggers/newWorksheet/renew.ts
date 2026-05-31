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
 * Google Sheets `new_worksheet` renewal handler.
 *
 * Mirrors `rowChanged/renew.ts` algorithm — same Drive watch
 * transport, same register-new-then-stop-old order. Kept as a
 * separate handler so the subscription registry's first-match
 * canHandle predicates stay mutually exclusive (each handler
 * targets a single eventType).
 *
 * Renewal threshold: 24h before `expiresAt`.
 *
 * Persistence: only the channel rotation fields change. The
 * `worksheetSnapshot` baseline survives rotation untouched.
 */

const RENEWAL_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function webhookAddress(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/webhooks/google-sheets`;
}

export const sheetsNewWorksheetSubscriptionHandler: SubscriptionHandler = {
  id: "google-sheets:new_worksheet",
  canHandle(trigger) {
    return (
      trigger.provider === "google-sheets" &&
      trigger.eventType === "new_worksheet" &&
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
        `google-sheets new_worksheet renew: trigger ${trigger.id} config missing spreadsheetId.`,
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
        `google-sheets new_worksheet renew: no active integration for user ${trigger.userId}.`,
      );
    }

    const newChannelId = `chainreact-${trigger.nodeId}-${randomUUID()}`;
    const newChannelToken = buildChannelToken({ channelId: newChannelId });

    const watch = await refreshAndRetry({
      accountId: integration.accountId,
      provider: "google-sheets",
      providerAccountId: integration.providerAccountId,
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

    if (oldChannelId && oldResourceId) {
      try {
        await refreshAndRetry({
          accountId: integration.accountId,
          provider: "google-sheets",
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

    const newConfig = {
      ...config,
      channelId: newChannelId,
      resourceId: watch.resourceId,
      expiresAt: newExpiresAt,
    };
    await triggerResourcesRepo.updateConfig(trigger.id, newConfig);
  },
};
