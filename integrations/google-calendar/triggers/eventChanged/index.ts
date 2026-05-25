import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import { activate } from "./activate";
import { deactivate } from "./deactivate";
import { calendarEventChangedSubscriptionHandler } from "./renew";

/**
 * Module-init registration for the Google Calendar `event_changed`
 * watch-based push trigger.
 *
 * Three registrations:
 *   - activation: creates the watch + captures initial syncToken
 *   - deactivation: stops the watch when the workflow is disabled
 *   - subscription handler: renews the watch before its 7-day expiry
 *
 * Importing this module from `integrations/_registry.ts` forces all three
 * registrations at module load. The webhook receiver and renewal cron
 * route both transitively import the registry.
 */
registerActivation("google-calendar", "event_changed", activate);
registerDeactivation("google-calendar", "event_changed", deactivate);
registerSubscriptionHandler(calendarEventChangedSubscriptionHandler);

export { activate, deactivate, calendarEventChangedSubscriptionHandler };
