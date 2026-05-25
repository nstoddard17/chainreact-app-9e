import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { SubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import { renewSubscription } from "@/integrations/_shared/microsoft/api/subscriptions";

/**
 * Microsoft Outlook email_flagged renewal handler.
 *
 * Outlook Mail 2.3 Commit 3. Same shape as new_email's renew. The only
 * difference is the `canHandle(trigger)` predicate: matches
 * `eventType === "email_flagged"`.
 */

const RENEWAL_THRESHOLD_MS = 60 * 60 * 1000;
const EXPIRATION_MINUTES = 4230;

function expirationFromNow(now: Date = new Date()): string {
  const t = new Date(now.getTime() + EXPIRATION_MINUTES * 60 * 1000);
  return t.toISOString();
}

export const outlookEmailFlaggedSubscriptionHandler: SubscriptionHandler = {
  id: "microsoft-outlook:email_flagged",
  canHandle(trigger) {
    return (
      trigger.provider === "microsoft-outlook" &&
      trigger.eventType === "email_flagged" &&
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
    };
    const subscriptionId = config.subscriptionId;
    if (!subscriptionId) {
      throw new Error(
        `microsoft-outlook email_flagged renew: trigger ${trigger.id} config missing subscriptionId.`,
      );
    }

    const integration = await getActiveForExecution(
      trigger.userId,
      trigger.provider,
      trigger.accountId,
    );
    if (!integration) {
      throw new Error(
        `microsoft-outlook email_flagged renew: no active integration for user ${trigger.userId}.`,
      );
    }

    const newExpiresAt = expirationFromNow();
    const result = await refreshAndRetry({
      userId: integration.userId,
      provider: "microsoft-outlook",
      accountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        renewSubscription({
          accessToken,
          subscriptionId,
          expirationDateTime: newExpiresAt,
        }),
    });

    await triggerResourcesRepo.updateConfig(trigger.id, {
      ...config,
      expiresAt: result.expirationDateTime,
    });
  },
};
