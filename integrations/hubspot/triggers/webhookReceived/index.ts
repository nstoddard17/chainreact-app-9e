import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { activate } from "./activate";
import { deactivate } from "./deactivate";

/**
 * Module-init registration for the HubSpot `webhook_received` trigger
 * — Slice 13 Commit 5.
 *
 * **Two registrations only — no subscription handler.**
 *   - activation: validates `node.config.subscriptions[]`, walks each
 *     entry, `findOrCreate`s an app-level HubSpot subscription via
 *     `hubspot_app_subscriptions` (creates one only when the first
 *     workflow asks for that `(eventType, propertyName)`), and `upsert`s
 *     a ref row in `hubspot_subscription_refs` binding this workflow
 *     node to the app subscription.
 *   - deactivation: walks `trigger_resources.config.subscriptions[]`,
 *     deletes each ref, and only DELETEs the HubSpot app-level
 *     subscription + `hubspot_app_subscriptions` row when the last ref
 *     is removed.
 *
 * **NO subscription handler registration.** HubSpot webhook
 * subscriptions don't expire — the `runRenewals` cron filters on
 * `config.type === "subscription-watch"` and HubSpot's activate hook
 * intentionally omits the marker (same "permanent endpoint" pattern as
 * Slice 11 Stripe / Slice 12 Shopify).
 *
 * Importing this module from `integrations/_registry.ts` forces both
 * registrations at module load. The webhook receive route also
 * transitively imports the registry to ensure the deactivation hook is
 * available when the receive path runs in a fresh worker process.
 */
registerActivation("hubspot", "webhook_received", activate);
registerDeactivation("hubspot", "webhook_received", deactivate);

export { activate, deactivate };
