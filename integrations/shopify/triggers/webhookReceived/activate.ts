import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { decryptToken } from "@/core/encryption/tokens";
import {
  webhooksCreate,
  webhooksDelete,
  type ShopifyWebhook,
} from "@/integrations/_shared/shopify/api/webhooks";
import {
  isAllowedShopifyTopic,
  SHOPIFY_ALLOWED_TOPICS,
} from "./allowedTopics";

/**
 * Shopify `webhook_received` activation hook — Slice 12 Commit 4.
 *
 * Reads `node.config.topics` (REQUIRED, non-empty array of allowlisted
 * Shopify topic strings) and creates ONE webhook subscription per topic
 * on the merchant's shop using the merchant's offline access token.
 *
 * Persists the response in `trigger_resources.config`:
 *   - `webhookEnabled: true` (parity with other V2 webhook triggers).
 *   - `shopDomain` — the shop the webhooks belong to. Stored even
 *     though it's also `triggerResource.accountId` because the
 *     deactivate hook reads it directly from `config` without an
 *     extra DB lookup.
 *   - `subscriptions: [{ topic, webhookId }, ...]` — for deactivation.
 *   - `topics: string[]` — the curated activation-time topic
 *     allowlist. Receive route uses this for defense-in-depth (events
 *     outside this list are 200-acked without dispatch).
 *
 * **NO `type: "subscription-watch"` field.** Shopify webhooks don't
 * expire (unlike Microsoft Graph / Airtable). The `runRenewals` cron
 * filters on `config.type === "subscription-watch"` — Shopify's
 * activate intentionally omits it so the renewal cron never picks
 * up Shopify rows. Same "permanent endpoint" pattern as Slice 11
 * Stripe.
 *
 * **Notification URL** — `${V2_BASE_URL}/api/webhooks/shopify?workflowId=X&nodeId=Y`.
 * The query params drive the receive route's strict-direct-lookup
 * (`findByWorkflowAndNode`). The receive route ALSO reads the
 * `X-Shopify-Topic` header for routing the topic discriminator.
 *
 * **Best-effort rollback on partial failure.** If topic #4 of #5
 * fails, V2 best-effort deletes the 4 successful webhooks before
 * re-throwing the activation error. This keeps Shopify in a clean
 * "either all or nothing" state per shop. Rollback errors are
 * swallowed because the original failure is the load-bearing one
 * to surface.
 *
 * Throws abort the activate transition (TRIGGER_REGISTRATION_FAILED).
 */

function webhookBaseUrl(): string {
  const explicit = process.env.SHOPIFY_WEBHOOK_URL?.trim();
  if (explicit) return stripWebhookPath(explicit);
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function stripWebhookPath(url: string): string {
  const trimmed = url.replace(/\/$/, "");
  const idx = trimmed.toLowerCase().indexOf("/api/webhooks/shopify");
  if (idx !== -1) return trimmed.slice(0, idx);
  return trimmed;
}

function notificationUrl(workflowId: string, nodeId: string): string {
  const params = new URLSearchParams({ workflowId, nodeId });
  return `${webhookBaseUrl()}/api/webhooks/shopify?${params.toString()}`;
}

export const activate: ActivationFn = async ({
  node,
  integration,
  workflowId,
}) => {
  // Validate topic shape + allowlist BEFORE any Shopify round trip so
  // misconfigured workflows fail fast at design time.
  const raw = node.config?.topics;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(
      "shopify webhook_received activate: node.config.topics is required (non-empty array of allowlisted Shopify topic strings).",
    );
  }
  const topics: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string" || !isAllowedShopifyTopic(v)) {
      throw new Error(
        `shopify webhook_received activate: '${String(v)}' is not in the Slice 12 Batch 1 topic allowlist. Allowed: ${SHOPIFY_ALLOWED_TOPICS.join(", ")}.`,
      );
    }
    topics.push(v);
  }

  // The shop domain is the integration's providerAccountId. The
  // merchant's access token is decrypted here (auxiliary path: not
  // wrapped in refreshAndRetry because activation runs inside the
  // workflow-activate transaction, which already validated the
  // integration; if the token is stale, the user's first action call
  // will surface the 401).
  const shopDomain = integration.accountId;
  const accessToken = decryptToken(integration.accessTokenEncrypted);

  const address = notificationUrl(workflowId, node.id);

  const subscriptions: { topic: string; webhookId: number }[] = [];
  let firstFailure: unknown = null;
  for (const topic of topics) {
    try {
      const created: ShopifyWebhook = await webhooksCreate({
        shopDomain,
        accessToken,
        topic,
        address,
      });
      subscriptions.push({ topic, webhookId: created.id });
    } catch (err) {
      firstFailure = err;
      break;
    }
  }

  if (firstFailure !== null) {
    // Best-effort rollback: delete each successfully-created webhook so
    // Shopify doesn't retain orphaned subscriptions. Errors here are
    // swallowed (we already failed; the original error is what we want
    // to surface to the lifecycle orchestrator).
    for (const sub of subscriptions) {
      try {
        await webhooksDelete({
          shopDomain,
          accessToken,
          webhookId: sub.webhookId,
        });
      } catch {
        // best-effort
      }
    }
    throw firstFailure instanceof Error
      ? firstFailure
      : new Error(String(firstFailure));
  }

  return {
    webhookEnabled: true,
    shopDomain,
    topics,
    subscriptions,
    notificationUrl: address,
  };
};
