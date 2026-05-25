import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { activate } from "./activate";
import { deactivate } from "./deactivate";

/**
 * Module-init registration for the GitHub `new_commit` trigger —
 * Slice 14b Commit 4.
 *
 * **Two registrations only — no subscription handler.**
 *   - activation: creates one repo webhook on the user's repository,
 *     persists hookId + repository + branch + events to
 *     `trigger_resources.config`.
 *   - deactivation: deletes the repo webhook when the workflow is
 *     disabled / deleted. Best-effort 404 / 401 → swallow (user may
 *     have deleted the OAuth App or the webhook directly).
 *
 * **NO subscription handler registration.** GitHub repo webhooks
 * don't expire. The `runRenewals` cron filters on
 * `config.type === "subscription-watch"` — GitHub's activate hook
 * intentionally omits that marker so the renewal cron never picks
 * up GitHub rows. Same "permanent endpoint" pattern as Slice 11
 * Stripe and Slice 12 Shopify.
 *
 * Importing this module from `integrations/_registry.ts` forces both
 * registrations at module load. The webhook receive route also
 * transitively imports the registry to ensure the deactivation hook
 * is available when the receive path runs in a fresh worker process.
 */
registerActivation("github", "new_commit", activate);
registerDeactivation("github", "new_commit", deactivate);

export { activate, deactivate };
