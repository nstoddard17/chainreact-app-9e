import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerPollingHandler } from "@/services/triggers/pollingRegistry";
import { activate } from "./activate";
import { mailchimpCampaignCreatedPollingHandler } from "./poll";

/**
 * Module-init registration for the Mailchimp `campaign_created`
 * polling trigger — Slice 14 Commit 5.
 *
 * **Two registrations only — no subscription handler.** Polling
 * triggers don't need the renewal cron; the polling cron itself
 * picks up the row via `config.pollingEnabled: true`.
 *
 * Importing this module from `integrations/_registry.ts` forces
 * both registrations at module load.
 */
registerActivation("mailchimp", "campaign_created", activate);
registerPollingHandler(mailchimpCampaignCreatedPollingHandler);

export { activate, mailchimpCampaignCreatedPollingHandler };
