import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { SubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import { renewSubscription } from "@/integrations/_shared/microsoft/api/subscriptions";

/**
 * Microsoft Outlook new_email renewal handler.
 *
 * Called by `services/triggers/runRenewals.ts` (existing cron — no new
 * job) when the row's `expiresAt` is within 1 hour of `now`.
 *
 * Slice 6 plan §"Trigger algorithm" / §"Risk callouts" #3:
 *   - Threshold: 1h. With a ~70.5h max expiration and a 10-minute cron
 *     tick, that's 6 attempts in the worst case before the subscription
 *     truly expires — generous safety margin.
 *   - PATCH /v1.0/subscriptions/{id} with { expirationDateTime: now + max }.
 *   - Token is fetched fresh via refreshAndRetry — V1 rot fix #1: V1's
 *     renewal cron passed `subscription.accessToken` (which is empty
 *     per subscriptionManager.ts:303), so it only renewed when the
 *     in-flight token happened to coincide with a fresh one. V2 makes
 *     correctness a property of the contract.
 *   - Persist new `expiresAt` back to config — `subscriptionId` and
 *     `clientState` survive rotation untouched.
 *   - On `IntegrationActionRequiredError` (refresh itself failed): the
 *     handler propagates and runRenewals.ts:88-89 increments the
 *     errors counter; the row stays active until its real expiration
 *     lapses, at which point Graph auto-cleans server-side and the
 *     row's expiresAt parses as past so runRenewals stops trying.
 *     Slice 6 does NOT auto-disable workflows on persistent failure;
 *     that policy belongs to the proactive-health system.
 */

const RENEWAL_THRESHOLD_MS = 60 * 60 * 1000; // 1h
const EXPIRATION_MINUTES = 4230; // Outlook /me/messages max — same as activate.

function expirationFromNow(now: Date = new Date()): string {
  const t = new Date(now.getTime() + EXPIRATION_MINUTES * 60 * 1000);
  return t.toISOString();
}

export const outlookNewEmailSubscriptionHandler: SubscriptionHandler = {
  id: "microsoft-outlook:new_email",
  canHandle(trigger) {
    return (
      trigger.provider === "microsoft-outlook" &&
      trigger.eventType === "new_email" &&
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
        `microsoft-outlook renew: trigger ${trigger.id} config missing subscriptionId.`,
      );
    }

    const integration = await getActiveForExecution(trigger.workflowAccountId!,
      trigger.provider,
      trigger.providerAccountId,
    );
    if (!integration) {
      throw new Error(
        `microsoft-outlook renew: no active integration for user ${trigger.userId}.`,
      );
    }

    const newExpiresAt = expirationFromNow();
    const result = await refreshAndRetry({
      accountId: integration.accountId,
      provider: "microsoft-outlook",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        renewSubscription({
          accessToken,
          subscriptionId,
          expirationDateTime: newExpiresAt,
        }),
    });

    // Persist Graph's authoritative expiresAt (Graph may round down).
    // subscriptionId, clientState, resource, type all survive untouched.
    await triggerResourcesRepo.updateConfig(trigger.id, {
      ...config,
      expiresAt: result.expirationDateTime,
    });
  },
};
