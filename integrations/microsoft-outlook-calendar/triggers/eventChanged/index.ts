import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import { activate } from "./activate";
import { deactivate } from "./deactivate";
import { outlookCalendarEventChangedSubscriptionHandler } from "./renew";

/**
 * Module-init registration for the Microsoft Outlook Calendar
 * `event_changed` subscription-watch trigger.
 *
 * Three registrations:
 *   - activation: creates the Graph subscription on /me/events with a
 *     32-byte hex clientState and `changeType: "created,updated,deleted"`;
 *     persists subscriptionId + clientState + expiresAt in
 *     trigger_resources.config.
 *   - deactivation: deletes the subscription when the workflow is
 *     disabled. Best-effort 404/403 → swallow.
 *   - subscription handler: renews the subscription before its 70.5h
 *     expiry. Picked up by the existing `services/triggers/runRenewals.ts`
 *     cron via subscriptionRegistry — no new cron job. Renewal threshold
 *     is 1h.
 *
 * Importing this module from `integrations/_registry.ts` forces all
 * three registrations at module load. The webhook receive route
 * transitively imports the registry to ensure the deactivation hook is
 * available even when the receive path runs in a fresh worker process.
 */
registerActivation("microsoft-outlook-calendar", "event_changed", activate);
registerDeactivation(
  "microsoft-outlook-calendar",
  "event_changed",
  deactivate,
);
registerSubscriptionHandler(outlookCalendarEventChangedSubscriptionHandler);

export {
  activate,
  deactivate,
  outlookCalendarEventChangedSubscriptionHandler,
};
