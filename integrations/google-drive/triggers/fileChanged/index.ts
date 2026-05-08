import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import { activate } from "./activate";
import { deactivate } from "./deactivate";
import { driveFileChangedSubscriptionHandler } from "./renew";

/**
 * Module-init registration for the Google Drive `file_changed` watch-based
 * push trigger.
 *
 * Three registrations:
 *   - activation: captures startPageToken + creates the watch
 *   - deactivation: stops the watch when the workflow is disabled
 *   - subscription handler: renews the watch before its expiry
 *
 * Importing this module from `integrations/_registry.ts` forces all three
 * registrations at module load. The webhook receiver and renewal cron
 * route both transitively import the registry.
 */
registerActivation("google-drive", "file_changed", activate);
registerDeactivation("google-drive", "file_changed", deactivate);
registerSubscriptionHandler(driveFileChangedSubscriptionHandler);

export { activate, deactivate, driveFileChangedSubscriptionHandler };
