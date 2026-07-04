import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";
import {
  IntegrationActionRequiredError,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import { webhooksDelete } from "@/integrations/_shared/asana/api/webhooks";
import { NotFoundError } from "@/integrations/_shared/asana/errors";

/**
 * Shared deactivation hook for the 2 Asana project-webhook triggers —
 * Slice 5.ASANA-1.
 *
 * Reads `trigger_resources.config.webhookId` and DELETEs the Asana
 * webhook (`DELETE /webhooks/{gid}`, scope `webhooks:delete`). Wrapped in
 * `refreshAndRetry` because Asana access tokens expire hourly. Best-effort:
 *   - `NotFoundError` → swallow (already gone server-side — Asana
 *     self-deletes webhooks after 24h of failed deliveries, or the user
 *     removed the app).
 *   - `IntegrationActionRequiredError` → swallow (the credential is dead
 *     even after a refresh attempt; re-auth won't help THIS best-effort
 *     cleanup, and the lifecycle proceeds with row deletion regardless).
 *   - Other errors → propagate (the lifecycle orchestrator logs and
 *     proceeds per deactivationRegistry best-effort semantics).
 *
 * Skips silently when the row carries no `webhookId` — activation never
 * completed (handshakePending rows from an aborted activation).
 */
export const asanaSharedDeactivate: DeactivationFn = async ({
  trigger,
  integration,
}) => {
  const config = trigger.config as { webhookId?: string };
  const webhookId = config.webhookId;
  if (typeof webhookId !== "string" || webhookId.length === 0) return;

  try {
    await refreshAndRetry({
      accountId: integration.accountId,
      provider: "asana",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        webhooksDelete({ accessToken, webhookGid: webhookId }),
    });
  } catch (err) {
    if (err instanceof NotFoundError) return;
    if (err instanceof IntegrationActionRequiredError) return;
    throw err;
  }
};
