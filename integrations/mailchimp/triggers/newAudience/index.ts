import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerPollingHandler } from "@/services/triggers/pollingRegistry";
import { activate } from "./activate";
import { mailchimpNewAudiencePollingHandler } from "./poll";

/**
 * Module-init registration for the Mailchimp `new_audience` polling
 * trigger — Mailchimp 2.1 Commit 3.
 */
registerActivation("mailchimp", "new_audience", activate);
registerPollingHandler(mailchimpNewAudiencePollingHandler);

export { activate, mailchimpNewAudiencePollingHandler };
