import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import { activate } from "./activate";
import { deactivate } from "./deactivate";
import { outlookEmailFlaggedSubscriptionHandler } from "./renew";

/**
 * Module-init registration for the Microsoft Outlook `email_flagged`
 * subscription-watch trigger.
 *
 * Outlook Mail 2.3 Commit 3. Three registrations:
 *   - activation: creates subscription on /me/messages (or folder-
 *     scoped) with changeType=updated.
 *   - deactivation: deletes the subscription on workflow disable.
 *   - subscription handler: renews subscriptions before 70.5h expiry.
 *
 * D-OM4 V1-parity over-fire: the receive route filters on
 * `flag.flagStatus === "flagged"` AT receive time but does NOT track
 * prior state. Re-flags + subject edits on already-flagged messages
 * will fire the trigger again.
 */
registerActivation("microsoft-outlook", "email_flagged", activate);
registerDeactivation("microsoft-outlook", "email_flagged", deactivate);
registerSubscriptionHandler(outlookEmailFlaggedSubscriptionHandler);

export { activate, deactivate, outlookEmailFlaggedSubscriptionHandler };
