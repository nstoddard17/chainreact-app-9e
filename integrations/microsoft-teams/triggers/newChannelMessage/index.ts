import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import { activate } from "./activate";
import { deactivate } from "./deactivate";
import { teamsNewChannelMessageSubscriptionHandler } from "./renew";

/**
 * Module-init registration for the Microsoft Teams `new_channel_message`
 * subscription-watch trigger.
 *
 * Three registrations:
 *   - activation: generates 32-byte hex clientState, creates the Graph
 *     subscription on
 *     `/teams/{teamId}/channels/{channelId}/messages` with
 *     `changeType: created` + `includeResourceData: false`, persists
 *     subscriptionId / clientState / teamId / channelId / expiresAt in
 *     trigger_resources.config.
 *   - deactivation: deletes the subscription when the workflow is
 *     disabled. Best-effort 404/403 → swallow.
 *   - subscription handler: renews the subscription before its 70.5h
 *     expiry. Picked up by the existing `services/triggers/runRenewals.ts`
 *     cron — no new cron job. Renewal threshold is 1h.
 *
 * Importing this module from `integrations/_registry.ts` forces all
 * three registrations at module load. The webhook receive route
 * transitively imports the registry to ensure the deactivation hook is
 * available even when the receive path runs in a fresh worker process.
 */
registerActivation("microsoft-teams", "new_channel_message", activate);
registerDeactivation("microsoft-teams", "new_channel_message", deactivate);
registerSubscriptionHandler(teamsNewChannelMessageSubscriptionHandler);

export {
  activate,
  deactivate,
  teamsNewChannelMessageSubscriptionHandler,
};
