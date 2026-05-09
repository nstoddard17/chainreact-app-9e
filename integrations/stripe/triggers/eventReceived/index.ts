import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { activate } from "./activate";
import { deactivate } from "./deactivate";

/**
 * Module-init registration for the Stripe `event_received` webhook
 * trigger — Slice 11 Commit 4.
 *
 * **Two registrations only — no subscription handler.**
 *   - activation: creates a Connect-mode webhook endpoint on the
 *     platform Stripe account + persists endpointId / endpointSecret
 *     to `trigger_resources.config`.
 *   - deactivation: deletes the webhook endpoint when the workflow
 *     is disabled / deleted. Best-effort 404 → swallow.
 *
 * **NO subscription handler registration.** Stripe webhook endpoints
 * don't expire. The `runRenewals` cron at
 * `services/triggers/runRenewals.ts:34-36` filters on
 * `config.type === "subscription-watch"` — Stripe's activate hook
 * intentionally omits that marker, so the renewal cron never picks
 * up Stripe rows. This is the cleanest "permanent endpoint" pattern
 * V2 supports: opt out of the cron by not setting the marker, no
 * permanent-handler stub or `Number.POSITIVE_INFINITY` threshold
 * required.
 *
 * Importing this module from `integrations/_registry.ts` forces both
 * registrations at module load. The webhook receive route also
 * transitively imports the registry to ensure the deactivation hook
 * is available when the receive path runs in a fresh worker process.
 */
registerActivation("stripe", "event_received", activate);
registerDeactivation("stripe", "event_received", deactivate);

export { activate, deactivate };
