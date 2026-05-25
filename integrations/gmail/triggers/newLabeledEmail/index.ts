import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerPollingHandler } from "@/services/triggers/pollingRegistry";
import { activate } from "./activate";
import { gmailNewLabeledEmailPollingHandler } from "./poll";

/**
 * Module-init registration for the Gmail "new_labeled_email" polling
 * trigger.
 *
 * Gmail 2.3 Commit 3 — same registration pattern as the new_email
 * trigger. Importing this module registers BOTH the activation hook
 * and the polling handler. The aggregating `integrations/_registry`
 * imports this module so cron picks up the trigger before the first
 * poll executes.
 */

registerActivation("gmail", "new_labeled_email", activate);
registerPollingHandler(gmailNewLabeledEmailPollingHandler);

export { activate, gmailNewLabeledEmailPollingHandler };
