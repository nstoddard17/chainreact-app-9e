import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";
import {
  IntegrationActionRequiredError,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import { companyWebhookDelete } from "@/integrations/_shared/motive/api/webhooks";

/**
 * Shared deactivation hook for the 7 Motive webhook triggers — MOTIVE-1.
 *
 * Reads `trigger_resources.config.webhookId` and DELETEs the Motive company
 * webhook (`DELETE /v1/company_webhooks/{id}`). Wrapped in `refreshAndRetry`
 * (Motive access tokens expire every 2h). Best-effort:
 *   - `companyWebhookDelete` swallows 404 internally (already gone).
 *   - `IntegrationActionRequiredError` → swallow (the credential is dead even
 *     after a refresh attempt; re-auth won't help this best-effort cleanup, and
 *     the lifecycle proceeds with row deletion regardless).
 *   - Other errors → propagate (the lifecycle logs and proceeds per
 *     best-effort deactivation semantics).
 *
 * Skips silently when the row carries no `webhookId` (activation never
 * completed).
 */
export const motiveSharedDeactivate: DeactivationFn = async ({
  trigger,
  integration,
}) => {
  const config = trigger.config as { webhookId?: string };
  const webhookId = config.webhookId;
  if (typeof webhookId !== "string" || webhookId.length === 0) return;

  try {
    await refreshAndRetry({
      accountId: integration.accountId,
      provider: "motive",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => companyWebhookDelete({ accessToken, webhookId }),
    });
  } catch (err) {
    if (err instanceof IntegrationActionRequiredError) return;
    throw err;
  }
};
