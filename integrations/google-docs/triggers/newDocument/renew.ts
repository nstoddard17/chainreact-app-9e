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
 * Google Docs `new_document` renewal handler — Slice 3.GDOCS-5.
 *
 * Mirrors `google-drive/triggers/fileChanged/renew.ts`. Register-new-
 * then-stop-old order — if step 3 fails the new channel is already
 * live; reverse order would leave a window with no active watch.
 *
 * `fileId` survives rotation (root or configured folder). `pageToken`
 * survives rotation too — it tracks the changes.list cursor, not the
 * channel.
 */

const RENEWAL_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h

function webhookAddress(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/webhooks/google-docs`;
}

export const googleDocsNewDocumentSubscriptionHandler: SubscriptionHandler = {
  id: "google-docs:new_document",
  canHandle(trigger) {
    return (
      trigger.provider === "google-docs" &&
      trigger.eventType === "new_document" &&
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
      folderId?: string;
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
        `google-docs new_document renew: no active integration for user ${trigger.userId}.`,
      );
    }

    const newChannelId = `chainreact-${trigger.nodeId}-${randomUUID()}`;
    const newChannelToken = buildChannelToken({ channelId: newChannelId });

    const watch = await refreshAndRetry({
      accountId: integration.accountId,
      provider: "google-docs",
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

    if (oldChannelId && oldResourceId) {
      try {
        await refreshAndRetry({
          accountId: integration.accountId,
          provider: "google-docs",
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
              event: "google_docs.new_document.stop_old_channel_failed",
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
