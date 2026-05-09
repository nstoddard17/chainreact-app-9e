import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";
import { NotFoundError } from "@/integrations/_shared/stripe/errors";
import { webhookEndpointsDelete } from "@/integrations/_shared/stripe/api/webhookEndpoints";

/**
 * Stripe `event_received` deactivation hook — Slice 11 Commit 4.
 *
 * Best-effort, mirrors V2's other webhook triggers:
 *   - 404 → swallow (endpoint already gone server-side; e.g. a
 *     dashboard delete by the platform admin).
 *   - Other errors → propagate; the lifecycle orchestrator catches
 *     and proceeds with row deletion (best-effort cleanup is
 *     housekeeping per `deactivationRegistry.ts:18`).
 *
 * Skips silently when the trigger row doesn't carry an `endpointId`
 * — the row was never registered as a webhook trigger (early tests,
 * corrupt rows, or partial activation).
 *
 * Uses the platform secret (`STRIPE_CLIENT_SECRET` env), NOT the
 * merchant's OAuth token. The deactivation context's `integration` is
 * unused — the platform secret authorises the delete on the platform
 * Stripe account regardless of which merchant's tokens originally
 * triggered the activation.
 */
function getPlatformSecret(): string {
  const secret = process.env.STRIPE_CLIENT_SECRET;
  if (!secret) {
    throw new Error(
      "stripe event_received deactivate: STRIPE_CLIENT_SECRET env var is not set.",
    );
  }
  return secret;
}

export const deactivate: DeactivationFn = async ({ trigger }) => {
  const config = trigger.config as { endpointId?: string };
  if (!config.endpointId) return;

  try {
    await webhookEndpointsDelete({
      platformSecret: getPlatformSecret(),
      id: config.endpointId,
    });
  } catch (err) {
    if (err instanceof NotFoundError) return;
    throw err;
  }
};
