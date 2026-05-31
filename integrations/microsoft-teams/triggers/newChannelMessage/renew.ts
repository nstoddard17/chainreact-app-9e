import { renewSubscription } from "@/integrations/_shared/microsoft/api/subscriptions";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { SubscriptionHandler } from "@/services/triggers/subscriptionRegistry";

/**
 * Microsoft Teams `new_channel_message` renewal handler.
 *
 * Called by `services/triggers/runRenewals.ts` (existing cron — no new
 * job) when the row's `expiresAt` is within 1h of `now`. Matches the
 * sibling Microsoft providers (mail / calendar / OneDrive) shape — only
 * the provider id and the canHandle event-type filter differ.
 *
 * PATCH the subscription's `expirationDateTime` via the shared renewer.
 * Persist Graph's authoritative new `expiresAt` back to config
 * (preserve `subscriptionId`, `clientState`, `resource`, `changeType`,
 * `teamId`, `channelId`).
 */

const RENEWAL_THRESHOLD_MS = 60 * 60 * 1000; // 1h
const EXPIRATION_MINUTES = 4230; // Graph max for channel-messages subscriptions.

function expirationFromNow(now: Date = new Date()): string {
  const t = new Date(now.getTime() + EXPIRATION_MINUTES * 60 * 1000);
  return t.toISOString();
}

export const teamsNewChannelMessageSubscriptionHandler: SubscriptionHandler = {
  id: "microsoft-teams:new_channel_message",
  canHandle(trigger) {
    return (
      trigger.provider === "microsoft-teams" &&
      trigger.eventType === "new_channel_message" &&
      (trigger.config as { type?: string }).type === "subscription-watch"
    );
  },
  getRenewalThresholdMs() {
    return RENEWAL_THRESHOLD_MS;
  },
  async renew({ trigger }) {
    const config = trigger.config as {
      subscriptionId?: string;
      clientState?: string;
      resource?: string;
      changeType?: string;
      teamId?: string;
      channelId?: string;
    };
    const subscriptionId = config.subscriptionId;
    if (!subscriptionId) {
      throw new Error(
        `microsoft-teams renew: trigger ${trigger.id} config missing subscriptionId.`,
      );
    }

    const integration = await getActiveForExecution(trigger.workflowAccountId!,
      trigger.provider,
      trigger.providerAccountId,
    );
    if (!integration) {
      throw new Error(
        `microsoft-teams renew: no active integration for user ${trigger.userId}.`,
      );
    }

    const newExpiresAt = expirationFromNow();
    const result = await refreshAndRetry({
      accountId: integration.accountId,
      provider: "microsoft-teams",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        renewSubscription({
          accessToken,
          subscriptionId,
          expirationDateTime: newExpiresAt,
        }),
    });

    // Persist Graph's authoritative expiresAt (Graph may round down).
    // subscriptionId, clientState, resource, changeType, teamId,
    // channelId all survive untouched.
    await triggerResourcesRepo.updateConfig(trigger.id, {
      ...config,
      expiresAt: result.expirationDateTime,
    });
  },
};
