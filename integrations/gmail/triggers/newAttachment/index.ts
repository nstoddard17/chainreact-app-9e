import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerPollingHandler } from "@/services/triggers/pollingRegistry";
import { activate } from "./activate";
import { gmailNewAttachmentPollingHandler } from "./poll";

/**
 * Module-init registration for the Gmail "new_attachment" polling
 * trigger.
 *
 * Gmail 2.3 Commit 4 — same registration pattern as the new_email
 * and new_labeled_email triggers. Importing this module registers
 * BOTH the activation hook and the polling handler. The aggregating
 * `integrations/_registry` imports this module so cron picks up the
 * trigger before the first poll executes.
 */

registerActivation("gmail", "new_attachment", activate);
registerPollingHandler(gmailNewAttachmentPollingHandler);

export { activate, gmailNewAttachmentPollingHandler };
