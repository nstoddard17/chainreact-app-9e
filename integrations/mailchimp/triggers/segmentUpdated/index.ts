import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerPollingHandler } from "@/services/triggers/pollingRegistry";
import { activate } from "./activate";
import { mailchimpSegmentUpdatedPollingHandler } from "./poll";

/**
 * Module-init registration for the Mailchimp `segment_updated`
 * polling trigger — Mailchimp 2.1 Commit 3.
 */
registerActivation("mailchimp", "segment_updated", activate);
registerPollingHandler(mailchimpSegmentUpdatedPollingHandler);

export { activate, mailchimpSegmentUpdatedPollingHandler };
