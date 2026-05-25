import { randomUUID } from "node:crypto";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { SubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import { channelsStop } from "../../api/channelsStop";
import { NotFoundError } from "../../api/errors";
import { eventsWatch } from "../../api/eventsWatch";
import { buildChannelToken } from "@/integrations/_shared/google/channelToken";

/**
 * Google Calendar event_changed renewal handler.
 *
 * Called by `services/triggers/runRenewals.ts` when the row's `expiresAt`
 * is within the renewal threshold (24h before Google's 7-day expiry).
 *
 * Algorithm:
 *   1. Generate a fresh channelId + HMAC token.
 *   2. Call `events.watch` to register the new channel.
 *   3. Call `channels.stop` on the OLD channel (best-effort; ignore 404).
 *   4. Persist new channelId / resourceId / expiresAt to trigger_resources.
 *      `syncToken` survives rotation — it tracks the events.list sync
 *      cursor, not the channel itself.
 *
 * Why register-new-then-stop-old (not stop-then-register): if step 3 fails,
 * we still have a working new channel. If we stopped first and the new
 * registration failed, we'd be deaf to events until the next renewal cron
 * tick — much worse.
 */

const RENEWAL_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h

function webhookAddress(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/webhooks/google-calendar`;
}

export const calendarEventChangedSubscriptionHandler: SubscriptionHandler = {
  id: "google-calendar:event_changed",
  canHandle(trigger) {
    return (
      trigger.provider === "google-calendar" &&
      trigger.eventType === "event_changed" &&
      (trigger.config as { type?: string }).type === "subscription-watch"
    );
  },
  getRenewalThresholdMs() {
    return RENEWAL_THRESHOLD_MS;
  },
  async renew({ trigger }) {
    const config = trigger.config as {
      calendarId?: string;
      channelId?: string;
      resourceId?: string;
      syncToken?: string;
    };
    const calendarId = config.calendarId ?? "primary";
    const oldChannelId = config.channelId;
    const oldResourceId = config.resourceId;

    const integration = await getActiveForExecution(
      trigger.userId,
      trigger.provider,
      trigger.accountId,
    );
    if (!integration) {
      throw new Error(
        `google-calendar renew: no active integration for user ${trigger.userId}.`,
      );
    }

    // 1 + 2: register fresh channel.
    const newChannelId = `chainreact-${trigger.nodeId}-${randomUUID()}`;
    const newChannelToken = buildChannelToken({ channelId: newChannelId });

    const watch = await refreshAndRetry({
      userId: integration.userId,
      provider: "google-calendar",
      accountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        eventsWatch({
          accessToken,
          calendarId,
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
          userId: integration.userId,
          provider: "google-calendar",
          accountId: integration.providerAccountId,
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
          // in 7d if Google didn't accept the stop call.
          console.warn(
            JSON.stringify({
              event: "calendar.watch.stop_old_channel_failed",
              triggerId: trigger.id,
              oldChannelId,
              error: (err as Error).message,
            }),
          );
        }
      }
    }

    // 4: persist new state. syncToken untouched.
    const newConfig = {
      ...config,
      channelId: newChannelId,
      resourceId: watch.resourceId,
      expiresAt: newExpiresAt,
    };
    await triggerResourcesRepo.updateConfig(trigger.id, newConfig);
  },
};
