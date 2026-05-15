import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerPollingHandler } from "@/services/triggers/pollingRegistry";
import { activate } from "./activate";
import { mailchimpSubscriberAddedToSegmentPollingHandler } from "./poll";

/**
 * Module-init registration for the Mailchimp
 * `subscriber_added_to_segment` polling trigger — Mailchimp 2.1
 * Commit 3.
 *
 * **Two registrations only — no subscription handler.** Polling
 * triggers don't need the renewal cron; the polling cron itself
 * picks up the row via `config.pollingEnabled: true`.
 */
registerActivation("mailchimp", "subscriber_added_to_segment", activate);
registerPollingHandler(mailchimpSubscriberAddedToSegmentPollingHandler);

export { activate, mailchimpSubscriberAddedToSegmentPollingHandler };
