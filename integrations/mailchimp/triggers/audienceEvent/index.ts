import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { activate } from "./activate";
import { deactivate } from "./deactivate";

/**
 * Module-init registration for the Mailchimp `audience_event`
 * consolidated webhook trigger — Slice 14 Commit 4.
 *
 * **Two registrations only — no subscription handler.**
 *   - activation: creates one Mailchimp webhook on the workflow's
 *     audience (or adopts an existing webhook at the same URL),
 *     persists webhookId + audienceId + eventTypes to
 *     `trigger_resources.config`.
 *   - deactivation: deletes the Mailchimp webhook when the
 *     workflow is disabled / deleted. Best-effort: 404 / 401 →
 *     swallow.
 *
 * **NO subscription handler registration.** Mailchimp webhooks
 * don't expire. The `runRenewals` cron filters on
 * `config.type === "subscription-watch"` — `activate.ts`
 * intentionally omits that marker, so the renewal cron never picks
 * up Mailchimp rows. Same "permanent endpoint" pattern as Slice 11
 * Stripe, Slice 12 Shopify, Slice 13 HubSpot, Slice 14b GitHub.
 *
 * Importing this module from `integrations/_registry.ts` forces
 * both registrations at module load. The webhook receive route also
 * transitively imports the registry to ensure the deactivation hook
 * is available when the receive path runs in a fresh worker process.
 */
registerActivation("mailchimp", "audience_event", activate);
registerDeactivation("mailchimp", "audience_event", deactivate);

export { activate, deactivate };
