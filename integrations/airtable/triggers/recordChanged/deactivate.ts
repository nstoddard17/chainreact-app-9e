import { NotFoundError } from "@/integrations/_shared/airtable/errors";
import { webhooksDelete } from "@/integrations/_shared/airtable/api/webhooks";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";

/**
 * Airtable `record_changed` deactivation hook.
 *
 * Best-effort, mirrors V2's other webhook triggers (Microsoft / Google):
 *   - 404 → swallow (webhook already gone server-side).
 *   - 403 → swallow (token lacks permission OR webhook created by a
 *     different client; Airtable auto-cleans on TTL expiry).
 *   - Other errors → propagate; the lifecycle orchestrator catches and
 *     proceeds with row deletion (best-effort cleanup is housekeeping).
 *
 * Skips silently when the trigger row doesn't carry a `webhookId` —
 * either the row was never registered as a subscription-watch (early
 * tests / corrupt rows) or activation was partial.
 */
export const deactivate: DeactivationFn = async ({ trigger, integration }) => {
  const config = trigger.config as {
    type?: string;
    baseId?: string;
    webhookId?: string;
  };

  if (config.type !== "subscription-watch") return;
  if (!config.baseId || !config.webhookId) return;

  try {
    await refreshAndRetry({
      accountId: integration.accountId,
      provider: "airtable",
      providerAccountId: integration.accountId,
      apiCall: (accessToken) =>
        webhooksDelete({
          accessToken,
          baseId: config.baseId!,
          webhookId: config.webhookId!,
        }),
    });
  } catch (err) {
    if (err instanceof NotFoundError) return;
    if (err instanceof Error && /403/.test(err.message)) return;
    throw err;
  }
};
