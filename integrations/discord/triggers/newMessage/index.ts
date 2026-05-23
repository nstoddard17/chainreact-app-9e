import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerPollingHandler } from "@/services/triggers/pollingRegistry";
import { activate } from "./activate";
import { discordNewMessagePollingHandler } from "./poll";

/**
 * Module-init registration for the Discord `new_message` polling
 * trigger — Slice 3.DISCORD-7.
 *
 * **Two registrations.**
 *   - activation: seeds `snapshot.lastSeenMessageId` from the
 *     channel's current newest message (or a synthesized "now"
 *     snowflake when empty). Required by the first-poll-miss rule.
 *   - polling handler: registered into the polling registry so the
 *     `/api/cron/poll-triggers` cron picks up Discord new_message
 *     rows at the default 5-minute cadence.
 *
 * **No deactivation hook.** Polling triggers have no provider-side
 * resource to tear down — disabling the workflow simply stops the
 * cron from picking up the row. The trigger_resources row deletion
 * (handled by `services/triggers/lifecycle.ts:unregisterWorkflowTriggers`)
 * is sufficient cleanup.
 *
 * Importing this module from `integrations/_registry.ts` forces both
 * registrations at module load. The cron route transitively imports
 * the registry to ensure registration is available before the first
 * poll tick.
 */
registerActivation("discord", "new_message", activate);
registerPollingHandler(discordNewMessagePollingHandler);

export { activate, discordNewMessagePollingHandler };
