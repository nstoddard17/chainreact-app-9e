import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerPollingHandler } from "@/services/triggers/pollingRegistry";
import { activate } from "./activate";
import { mailchimpEmailOpenedPollingHandler } from "./poll";

/**
 * Module-init registration for the Mailchimp `email_opened` polling
 * trigger — Slice 14 Commit 5.
 */
registerActivation("mailchimp", "email_opened", activate);
registerPollingHandler(mailchimpEmailOpenedPollingHandler);

export { activate, mailchimpEmailOpenedPollingHandler };
