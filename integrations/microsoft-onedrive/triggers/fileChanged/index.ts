import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import { activate } from "./activate";
import { deactivate } from "./deactivate";
import { onedriveFileChangedSubscriptionHandler } from "./renew";

/**
 * Module-init registration for the Microsoft OneDrive `file_changed`
 * subscription-watch trigger.
 *
 * Three registrations:
 *   - activation: walks /me/drive/root/delta to capture the baseline
 *     cursor, generates a 32-byte hex clientState, creates the Graph
 *     subscription on /me/drive/root with `changeType: "updated"`,
 *     and persists subscriptionId / clientState / deltaToken /
 *     expiresAt in trigger_resources.config.
 *   - deactivation: deletes the subscription when the workflow is
 *     disabled. Best-effort 404/403 → swallow.
 *   - subscription handler: renews the subscription before its 70.5h
 *     expiry. Picked up by the existing `services/triggers/runRenewals.ts`
 *     cron via subscriptionRegistry — no new cron job. Renewal threshold
 *     is 1h.
 *
 * Importing this module from `integrations/_registry.ts` forces all
 * three registrations at module load. The webhook receive route
 * transitively imports the registry to ensure the deactivation hook is
 * available even when the receive path runs in a fresh worker process.
 */
registerActivation("microsoft-onedrive", "file_changed", activate);
registerDeactivation("microsoft-onedrive", "file_changed", deactivate);
registerSubscriptionHandler(onedriveFileChangedSubscriptionHandler);

export {
  activate,
  deactivate,
  onedriveFileChangedSubscriptionHandler,
};
