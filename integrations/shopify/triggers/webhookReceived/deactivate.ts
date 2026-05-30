import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";
import { decryptToken } from "@/core/encryption/tokens";
import { NotFoundError } from "@/integrations/_shared/shopify/errors";
import { webhooksDelete } from "@/integrations/_shared/shopify/api/webhooks";

/**
 * Shopify `webhook_received` deactivation hook — Slice 12 Commit 4.
 *
 * Walks `trigger_resources.config.subscriptions[]` and DELETEs each
 * webhook on the merchant's shop. Best-effort:
 *   - 404 → swallow (the webhook is already gone server-side; common
 *     when the merchant has uninstalled the app, which revokes both
 *     the offline access token AND deletes all the merchant's
 *     webhooks). Activate doesn't depend on the cleanup, so we don't
 *     punish disable / delete for a state we can't observe.
 *   - 401 → swallow with a warn-level log. The merchant uninstalled;
 *     the token is dead; subsequent `webhooksDelete` calls would all
 *     401 — bail early.
 *   - Other errors → propagate (the lifecycle orchestrator catches
 *     and proceeds with row deletion per
 *     `deactivationRegistry.ts:18`).
 *
 * Skips silently when the trigger row carries no subscriptions array
 * — the row was registered but the activation hook never persisted
 * subscription IDs (early test fixtures, partial-activation
 * rollback that wiped the array, etc.).
 */
export const deactivate: DeactivationFn = async ({ trigger, integration }) => {
  const config = trigger.config as {
    shopDomain?: string;
    subscriptions?: ReadonlyArray<{ topic: string; webhookId: number }>;
  };
  const subscriptions = config.subscriptions ?? [];
  if (subscriptions.length === 0) return;

  // Prefer the integration row's providerAccountId (canonical) but
  // fall back to the config-stored shopDomain if for some reason the
  // integration row was deleted or its providerAccountId went empty
  // before deactivation runs. `||` (NOT `??`) — an empty string
  // falls through to the config value, since "" is a "missing" shop
  // domain even though it isn't null/undefined.
  const shopDomain = integration.accountId || config.shopDomain;
  if (!shopDomain) return;

  const accessToken = decryptToken(integration.accessTokenEncrypted);

  for (const sub of subscriptions) {
    try {
      await webhooksDelete({
        shopDomain,
        accessToken,
        webhookId: sub.webhookId,
      });
    } catch (err) {
      if (err instanceof NotFoundError) continue;
      // 401 surfaces from shopifyRequest as Unauthorized401Error from
      // the refreshAndRetry-shared module. We don't have refreshAndRetry
      // wrapping here because deactivation runs in best-effort mode
      // and re-auth doesn't help for a revoked-by-uninstall token.
      const errorName =
        err instanceof Error ? err.name : "unknown";
      if (errorName === "Unauthorized401Error") {
        // Token revoked (likely merchant uninstall) — bail rather
        // than 401-spam Shopify for the remaining subscriptions.
        return;
      }
      throw err;
    }
  }
};
