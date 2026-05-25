import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import { activate } from "./activate";
import { deactivate } from "./deactivate";
import { sheetsNewWorksheetSubscriptionHandler } from "./renew";

/**
 * Module-init registration for the Google Sheets `new_worksheet`
 * watch-based push trigger (Sheets 2.3 Commit 4).
 *
 * Three registrations, each scoped to `eventType === "new_worksheet"`:
 *   - activation: seeds the worksheet-name baseline via
 *     `spreadsheets.get` + creates the Drive `files.watch`.
 *   - deactivation: stops the watch when the workflow is disabled.
 *   - subscription handler: renews the watch before its expiry.
 *     Reuses the existing `services/triggers/runRenewals.ts` cron.
 *
 * Trigger registration is parallel to `rowChanged/index.ts` — both
 * share the Drive watch transport but each has its own activation,
 * pull (dispatched at the receive route by `eventType`), and
 * channel/resource pair.
 *
 * Importing this module from `integrations/_registry.ts` forces all
 * three registrations at module load. The webhook receiver and
 * renewal cron route both transitively import the registry.
 */
registerActivation("google-sheets", "new_worksheet", activate);
registerDeactivation("google-sheets", "new_worksheet", deactivate);
registerSubscriptionHandler(sheetsNewWorksheetSubscriptionHandler);

export { activate, deactivate, sheetsNewWorksheetSubscriptionHandler };
