import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerPollingHandler } from "@/services/triggers/pollingRegistry";
import { activate } from "./activate";
import { mailchimpLinkClickedPollingHandler } from "./poll";

/**
 * Module-init registration for the Mailchimp `link_clicked` polling
 * trigger — Slice 14 Commit 5.
 */
registerActivation("mailchimp", "link_clicked", activate);
registerPollingHandler(mailchimpLinkClickedPollingHandler);

export { activate, mailchimpLinkClickedPollingHandler };
