import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";
import { decryptToken } from "@/core/encryption/tokens";
import { NotFoundError } from "@/integrations/_shared/hubspot/errors";
import { deleteWebhookSubscription } from "@/integrations/_shared/hubspot/api/webhookSubscriptions";
import * as appSubsRepo from "@/repositories/hubspotAppSubscriptions";
import * as refsRepo from "@/repositories/hubspotSubscriptionRefs";

/**
 * HubSpot `webhook_received` deactivation hook — Slice 13 Commit 5.
 *
 * Walks `trigger_resources.config.subscriptions[]` and for each entry:
 *   1. Deletes the per-workflow ref row in `hubspot_subscription_refs`.
 *   2. Counts remaining refs on the parent app subscription.
 *   3. If zero refs remain: DELETE
 *      `/webhooks/v3/{appId}/subscriptions/{hubspotSubscriptionId}` on
 *      HubSpot, then delete the `hubspot_app_subscriptions` row.
 *
 * Best-effort cleanup at every wire-call layer:
 *   - 404 from HubSpot (subscription already gone) → swallow. Real-world
 *     trigger: a developer deleted the subscription via the HubSpot UI
 *     between activation and deactivation. The DB rows still need to
 *     be cleaned up so future activate runs aren't blocked by stale
 *     refs.
 *   - 401 from HubSpot (token revoked) → propagate to the orchestrator;
 *     the orchestrator catches and continues with row deletion per
 *     `deactivationRegistry.ts:18`. The DB ref/parent rows still get
 *     cleaned up; the orphaned HubSpot subscription is the next
 *     reconciler-cron's problem.
 *   - Other errors → propagate the same way.
 *
 * Mid-list failure does NOT abort the rest of the cleanup. Each
 * subscription entry is handled in its own try/catch so a single
 * misbehaving entry doesn't strand the others.
 *
 * Skips silently when:
 *   - `config.subscriptions` is absent or empty (early test fixtures,
 *     partial-activation rows that never persisted the array).
 *   - `config.appId` is absent (defensive — Activate always sets it).
 *
 * The activate path stored `subscriptions[].appSubscriptionId` so we
 * don't need to re-derive it via `appSubsRepo.find()`. That avoids a
 * race where another workflow's activate could create a different app
 * subscription with the same `(eventType, propertyName)` after we
 * read the original — at deactivate we point at exactly the
 * subscription our activation pointed at, never some replacement.
 */
export const deactivate: DeactivationFn = async ({ trigger, integration }) => {
  const config = trigger.config as {
    appId?: string;
    subscriptions?: ReadonlyArray<{
      eventType: string;
      propertyName: string | null;
      appSubscriptionId: string;
      hubspotSubscriptionId: string;
    }>;
  };
  const provisioned = config.subscriptions ?? [];
  if (provisioned.length === 0) return;
  const appId = config.appId;
  if (!appId) return;

  // Decrypt the token once — every per-subscription cleanup uses it.
  // If the integration row is gone (revoked / disconnected) the DB
  // cleanup still happens; the HubSpot API call will be skipped per
  // subscription (see the catch around deleteWebhookSubscription below).
  let accessToken: string | null = null;
  try {
    accessToken = decryptToken(integration.accessTokenEncrypted);
  } catch {
    accessToken = null;
  }

  for (const sub of provisioned) {
    try {
      // 1. Remove this workflow node's ref.
      await refsRepo.deleteOne({
        appSubscriptionId: sub.appSubscriptionId,
        workflowId: trigger.workflowId,
        nodeId: trigger.nodeId,
      });

      // 2. Refcount remaining refs.
      const remaining = await refsRepo.countRefs(sub.appSubscriptionId);
      if (remaining > 0) continue;

      // 3. Last ref — delete the HubSpot app-level subscription, then
      //    the DB row. The HubSpot DELETE is best-effort: 404 means it's
      //    already gone (swallow); other errors propagate via the
      //    outer catch.
      if (accessToken) {
        try {
          await deleteWebhookSubscription({
            accessToken,
            appId,
            subscriptionId: sub.hubspotSubscriptionId,
          });
        } catch (err) {
          if (!(err instanceof NotFoundError)) {
            throw err;
          }
        }
      }
      // ON DELETE CASCADE on hubspot_subscription_refs.app_subscription_id
      // would clean up any straggler refs (there should be none — we
      // just refcounted to 0 — but the cascade is defense-in-depth).
      await appSubsRepo.deleteById(sub.appSubscriptionId);
    } catch (err) {
      // Log + continue. The orchestrator's outer catch will surface to
      // structured logs; we don't want a single misbehaving subscription
      // to strand the others.
      console.warn(
        JSON.stringify({
          event: "hubspot.webhook.deactivate_error",
          workflowId: trigger.workflowId,
          nodeId: trigger.nodeId,
          appSubscriptionId: sub.appSubscriptionId,
          eventType: sub.eventType,
          error: (err as Error).message,
        }),
      );
    }
  }
};
