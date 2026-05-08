import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import { activate } from "./activate";
import { deactivate } from "./deactivate";
import { sheetsRowChangedSubscriptionHandler } from "./renew";

/**
 * Module-init registration for the Google Sheets `row_changed`
 * watch-based push trigger.
 *
 * Three registrations:
 *   - activation: snapshots row count + Drive pageToken + creates the
 *     watch via Drive files.watch on the spreadsheet's fileId.
 *   - deactivation: stops the watch when the workflow is disabled.
 *   - subscription handler: renews the watch before its expiry. Picked
 *     up by the existing `services/triggers/runRenewals.ts` cron via
 *     subscriptionRegistry — no new cron job.
 *
 * Importing this module from `integrations/_registry.ts` forces all
 * three registrations at module load. The webhook receiver and renewal
 * cron route both transitively import the registry.
 */
registerActivation("google-sheets", "row_changed", activate);
registerDeactivation("google-sheets", "row_changed", deactivate);
registerSubscriptionHandler(sheetsRowChangedSubscriptionHandler);

export { activate, deactivate, sheetsRowChangedSubscriptionHandler };
