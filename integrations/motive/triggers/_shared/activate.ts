import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { encryptToken } from "@/core/encryption/tokens";
import { companyWebhookCreate } from "@/integrations/_shared/motive/api/webhooks";
import { generateMotiveWebhookSecret } from "@/integrations/_shared/motive/webhooks/signature";
import { motiveNotificationUrl } from "./notificationUrl";
import { MOTIVE_EVENT_ACTIONS, type MotiveTriggerType } from "./eventMap";

/**
 * Shared activation builder for the 7 Motive webhook triggers — MOTIVE-1.
 *
 * Each trigger node creates its OWN per-company webhook via
 * `POST /v1/company_webhooks` (Asana per-(workflow,node) shape):
 *
 *   1. Generate a 20-char secret (V2-side; Motive requires exactly 20 chars).
 *   2. Create the webhook with `url = …/api/webhooks/motive?workflowId=&nodeId=`
 *      (strict-direct routing) subscribing to the trigger's Motive `actions`.
 *   3. Return the config patch — the lifecycle's final upsert persists it. The
 *      secret is stored ENCRYPTED (`encryptToken`).
 *
 * Unlike Asana there is NO mid-creation handshake (V2 supplies the secret), so
 * the standard return-patch flow is sufficient. If a Motive event somehow lands
 * before the lifecycle upsert commits the secret, receive.ts fails closed
 * ("unverifiable") and Motive's retry (1m/1h/6h) recovers.
 *
 * Provider calls go through `refreshAndRetry` — Motive access tokens expire
 * every 2 hours, so activation must tolerate a stale stored token.
 *
 * **NO `type: "subscription-watch"` marker** — Motive webhooks don't expire on
 * a schedule, so the renewal cron never touches these rows.
 *
 * `trigger_resources.config` after activation:
 *   - `webhookEnabled: true`
 *   - `companyId` — the watched Motive company (P-S2 dispatch scope).
 *   - `webhookId` — Motive's webhook id, for deactivation cleanup.
 *   - `hookSecretEncrypted` — the per-webhook HMAC-SHA1 secret (encrypted).
 *   - `notificationUrl` — the exact URL registered.
 */
export function buildMotiveActivate(triggerType: MotiveTriggerType): ActivationFn {
  return async ({ node, integration, workflowId }) => {
    const companyId = integration.providerAccountId;
    if (typeof companyId !== "string" || companyId.length === 0) {
      // oauth.ts refuses to persist a row without a companyId, so this only
      // fires on a corrupted row. Fail activation rather than register a
      // webhook whose events no filter could scope.
      throw new Error(
        `motive ${triggerType} activate: the integration row has no companyId (providerAccountId). Reconnect Motive.`,
      );
    }

    const secret = generateMotiveWebhookSecret();
    const url = motiveNotificationUrl(workflowId, node.id);

    const created = await refreshAndRetry({
      accountId: integration.accountId,
      provider: "motive",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        companyWebhookCreate({
          accessToken,
          url,
          secret,
          actions: MOTIVE_EVENT_ACTIONS[triggerType],
        }),
    });

    return {
      webhookEnabled: true,
      companyId,
      webhookId: created.webhookId,
      hookSecretEncrypted: encryptToken(secret),
      notificationUrl: url,
    };
  };
}
