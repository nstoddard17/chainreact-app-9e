import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";
import {
  IntegrationActionRequiredError,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import { webhookSubscriptionDelete } from "@/integrations/_shared/calendly/api/webhookSubscriptions";
import { NotFoundError } from "@/integrations/_shared/calendly/errors";
import { uuidFromUri } from "./project";

/**
 * Shared deactivation hook for the Calendly webhook triggers — Slice
 * 5.CALENDLY-1 (one instance registered per trigger type; the logic is
 * identical — the subscription URI on the row identifies the resource).
 *
 * Reads `trigger_resources.config.subscriptionUri` and DELETEs the
 * Calendly webhook subscription
 * (`DELETE /webhook_subscriptions/{uuid}`, scope `webhooks:write`).
 * Wrapped in `refreshAndRetry` because Calendly access tokens expire
 * after 2 hours. Best-effort (exact Asana/Typeform semantics):
 *   - `NotFoundError` → swallow (already gone provider-side — Calendly
 *     disables/removes subscriptions after 24h of failed deliveries, or
 *     an org admin deleted it).
 *   - `IntegrationActionRequiredError` → swallow (the credential is dead
 *     even after a refresh attempt; re-auth won't help THIS best-effort
 *     cleanup, and the lifecycle proceeds with row deletion regardless).
 *   - Other errors → propagate (the lifecycle orchestrator logs and
 *     proceeds per deactivationRegistry best-effort semantics).
 *
 * Skips silently when the row carries no `subscriptionUri` — activation
 * never completed.
 */
export const calendlyDeactivate: DeactivationFn = async ({
  trigger,
  integration,
}) => {
  const config = trigger.config as { subscriptionUri?: unknown };
  const subscriptionUri =
    typeof config.subscriptionUri === "string" && config.subscriptionUri.length > 0
      ? config.subscriptionUri
      : null;
  const subscriptionUuid = uuidFromUri(subscriptionUri);
  if (!subscriptionUuid) return;

  try {
    await refreshAndRetry({
      accountId: integration.accountId,
      provider: "calendly",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        webhookSubscriptionDelete({ accessToken, subscriptionUuid }),
    });
  } catch (err) {
    if (err instanceof NotFoundError) return;
    if (err instanceof IntegrationActionRequiredError) return;
    throw err;
  }
};
