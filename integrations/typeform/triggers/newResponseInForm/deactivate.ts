import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";
import {
  IntegrationActionRequiredError,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import { webhookDelete } from "@/integrations/_shared/typeform/api/webhooks";
import { NotFoundError } from "@/integrations/_shared/typeform/errors";

/**
 * Deactivation hook for `typeform:new_response_in_form` — Slice
 * 5.TYPEFORM-1.
 *
 * Reads `trigger_resources.config.{formId, webhookTag}` and DELETEs the
 * Typeform webhook (`DELETE /forms/{formId}/webhooks/{tag}`, scope
 * `webhooks:write`). Wrapped in `refreshAndRetry` because Typeform
 * access tokens expire weekly. Best-effort (exact Asana semantics):
 *   - `NotFoundError` → swallow (already gone provider-side — Typeform
 *     disables/removes webhooks after sustained delivery failure, or the
 *     user deleted the form).
 *   - `IntegrationActionRequiredError` → swallow (the credential is dead
 *     even after a refresh attempt; re-auth won't help THIS best-effort
 *     cleanup, and the lifecycle proceeds with row deletion regardless).
 *   - Other errors → propagate (the lifecycle orchestrator logs and
 *     proceeds per deactivationRegistry best-effort semantics).
 *
 * Skips silently when the row carries no `webhookTag` — activation never
 * completed.
 */
export const typeformNewResponseInFormDeactivate: DeactivationFn = async ({
  trigger,
  integration,
}) => {
  const config = trigger.config as { formId?: string; webhookTag?: string };
  const formId = config.formId;
  const tag = config.webhookTag;
  if (typeof tag !== "string" || tag.length === 0) return;
  if (typeof formId !== "string" || formId.length === 0) return;

  try {
    await refreshAndRetry({
      accountId: integration.accountId,
      provider: "typeform",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => webhookDelete({ accessToken, formId, tag }),
    });
  } catch (err) {
    if (err instanceof NotFoundError) return;
    if (err instanceof IntegrationActionRequiredError) return;
    throw err;
  }
};
