import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { activate } from "./activate";
import { deactivate } from "./deactivate";

/**
 * Module-init registration for the Shopify `webhook_received` trigger
 * — Slice 12 Commit 4.
 *
 * **Two registrations only — no subscription handler.**
 *   - activation: creates one webhook subscription per selected
 *     topic on the merchant's shop, persists subscription IDs +
 *     topics + shopDomain to `trigger_resources.config`.
 *   - deactivation: deletes each webhook subscription when the
 *     workflow is disabled / deleted. Best-effort 404 / 401 →
 *     swallow (merchant may have uninstalled).
 *
 * **NO subscription handler registration.** Shopify webhooks don't
 * expire. The `runRenewals` cron filters on
 * `config.type === "subscription-watch"` — Shopify's activate hook
 * intentionally omits that marker, so the renewal cron never picks
 * up Shopify rows. Same "permanent endpoint" pattern as Slice 11
 * Stripe.
 *
 * Importing this module from `integrations/_registry.ts` forces both
 * registrations at module load. The webhook receive route also
 * transitively imports the registry to ensure the deactivation hook
 * is available when the receive path runs in a fresh worker process.
 */
registerActivation("shopify", "webhook_received", activate);
registerDeactivation("shopify", "webhook_received", deactivate);

export { activate, deactivate };
