import { webhooksRefresh } from "@/integrations/_shared/airtable/api/webhooks";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { SubscriptionHandler } from "@/services/triggers/subscriptionRegistry";

/**
 * Airtable `record_changed` renewal handler.
 *
 * Called by `services/triggers/runRenewals.ts` (existing cron — no new
 * job) when the row's `expiresAt` is within 6 days of `now`. Airtable
 * webhooks have a 7-day TTL; the 6-day threshold gives a 24h+ buffer
 * around the renewal cron's hourly run cadence.
 *
 * POST `/v0/bases/{baseId}/webhooks/{webhookId}/refresh` with empty
 * body. Response carries the new `expirationTime` — persist back to
 * `trigger_resources.config` (preserve `webhookId, macSecretBase64,
 * baseId, tableIdOrName, lastCursor`).
 *
 * Slice 10 plan §"Webhook trigger model" #3 + §"Confirmed scope
 * decisions" #14.
 */

const RENEWAL_THRESHOLD_MS = 6 * 24 * 60 * 60 * 1000; // 6 days

export const airtableRecordChangedSubscriptionHandler: SubscriptionHandler = {
  id: "airtable:record_changed",
  canHandle(trigger) {
    return (
      trigger.provider === "airtable" &&
      trigger.eventType === "record_changed" &&
      (trigger.config as { type?: string }).type === "subscription-watch"
    );
  },
  getRenewalThresholdMs() {
    return RENEWAL_THRESHOLD_MS;
  },
  async renew({ trigger }) {
    const config = trigger.config as {
      baseId?: string;
      webhookId?: string;
      [k: string]: unknown;
    };
    if (!config.baseId || !config.webhookId) {
      throw new Error(
        `airtable renew: trigger ${trigger.id} config missing baseId or webhookId.`,
      );
    }

    const integration = await getActiveForExecution(trigger.workflowAccountId!,
      trigger.provider,
      trigger.providerAccountId,
    );
    if (!integration) {
      throw new Error(
        `airtable renew: no active integration for user ${trigger.userId}.`,
      );
    }

    const result = await refreshAndRetry({
      accountId: integration.accountId,
      provider: "airtable",
      providerAccountId: integration.accountId,
      apiCall: (accessToken) =>
        webhooksRefresh({
          accessToken,
          baseId: config.baseId!,
          webhookId: config.webhookId!,
        }),
    });

    // Persist Airtable's authoritative new expirationTime; everything
    // else (webhookId, macSecretBase64, baseId, tableIdOrName,
    // lastCursor, type) survives untouched.
    await triggerResourcesRepo.updateConfig(trigger.id, {
      ...config,
      expiresAt: result.expirationTime,
    });
  },
};
