import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import { activate } from "./activate";
import { deactivate } from "./deactivate";
import { outlookEmailSentSubscriptionHandler } from "./renew";

/**
 * Module-init registration for the Microsoft Outlook `email_sent`
 * subscription-watch trigger.
 *
 * Outlook Mail 2.3 Commit 3. Three registrations:
 *   - activation: creates the Graph subscription on
 *     /me/mailFolders/SentItems/messages with changeType=created.
 *   - deactivation: deletes the subscription on workflow disable.
 *   - subscription handler: renews subscriptions before 70.5h expiry.
 *
 * Importing this module from `integrations/_registry.ts` forces all
 * three registrations at module load.
 */
registerActivation("microsoft-outlook", "email_sent", activate);
registerDeactivation("microsoft-outlook", "email_sent", deactivate);
registerSubscriptionHandler(outlookEmailSentSubscriptionHandler);

export { activate, deactivate, outlookEmailSentSubscriptionHandler };
