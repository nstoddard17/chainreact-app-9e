import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";
import { decryptToken } from "@/core/encryption/tokens";
import { webhooksDelete } from "@/integrations/_shared/mailchimp/api/webhooks";
import { NotFoundError } from "@/integrations/_shared/mailchimp/errors";

/**
 * Mailchimp `audience_event` deactivation hook — Slice 14 Commit 4.
 *
 * Reads the webhook id + audience id from `trigger_resources.config`
 * and DELETEs the webhook from the audience. Best-effort:
 *   - 404 → swallow (the webhook is already gone server-side; can
 *     happen when the user has manually deleted it from the
 *     Mailchimp dashboard).
 *   - 401 → swallow with a warn-level log. Mailchimp is non-refreshable,
 *     so a 401 here means the token was revoked. Subsequent
 *     `webhooksDelete` calls would all 401 — bail early.
 *   - Other errors → propagate (the lifecycle orchestrator catches
 *     and proceeds with row deletion per
 *     `deactivationRegistry.ts:18`).
 *
 * Skips silently when the trigger row carries no `webhookId` /
 * `audienceId` — the row was registered but the activation hook
 * never persisted the values (early test fixtures, partial-activation
 * rollback, etc.).
 *
 * Reads `dc` from the integration row's `accountMetadata.dc`. If
 * `dc` is missing, skip the DELETE (logged) rather than throwing —
 * deactivation runs best-effort and propagating MissingDataCenterError
 * would block the trigger row's deletion for no real benefit.
 */
export const deactivate: DeactivationFn = async ({ trigger, integration }) => {
  const config = trigger.config as {
    audienceId?: string;
    webhookId?: string;
  };
  const audienceId = config.audienceId;
  const webhookId = config.webhookId;
  if (!audienceId || !webhookId) return;

  const dc = integration.accountMetadata.dc;
  if (typeof dc !== "string" || dc.length === 0) {
    // Can't construct the URL without dc. Skip the DELETE rather than
    // blocking deactivation — the worst case is an orphan webhook on
    // Mailchimp's side, which the duplicate-URL recovery in `activate`
    // will adopt next time.
    console.warn(
      JSON.stringify({
        event: "webhook.mailchimp.deactivate.missing_dc",
        workflowId: trigger.workflowId,
        nodeId: trigger.nodeId,
        audienceId,
        webhookId,
      }),
    );
    return;
  }

  const accessToken = decryptToken(integration.accessTokenEncrypted);

  try {
    await webhooksDelete({
      accessToken,
      dc,
      audienceId,
      webhookId,
    });
  } catch (err) {
    if (err instanceof NotFoundError) return;
    const errorName = err instanceof Error ? err.name : "unknown";
    if (errorName === "Unauthorized401Error") {
      // Token revoked — bail rather than 401-spam Mailchimp.
      console.warn(
        JSON.stringify({
          event: "webhook.mailchimp.deactivate.unauthorized",
          workflowId: trigger.workflowId,
          nodeId: trigger.nodeId,
        }),
      );
      return;
    }
    throw err;
  }
};
