import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { activate } from "./activate";
import { deactivate } from "./deactivate";

/**
 * Module-init registration for the Discord `slash_command` trigger —
 * Slice 3.DISCORD-6.
 *
 * **Two registrations only — no subscription handler.**
 *   - activation: upserts a guild-scoped slash command via Discord's
 *     `POST /applications/{app_id}/guilds/{guild_id}/commands`,
 *     persists `commandId` + identifying config to
 *     `trigger_resources.config`.
 *   - deactivation: deletes the registered command via
 *     `DELETE /applications/{app_id}/guilds/{guild_id}/commands/{command_id}`.
 *     Best-effort 404 swallow.
 *
 * **NO subscription handler registration.** Discord slash commands
 * don't expire — Discord persists registrations until the bot, the
 * application, or the command is deleted. The `runRenewals` cron
 * filters on `config.type === "subscription-watch"` (intentionally
 * absent from our activate config) so the renewal cron never picks
 * this trigger up. Same "permanent endpoint" pattern as Stripe / GitHub.
 *
 * Importing this module from `integrations/_registry.ts` forces both
 * registrations at module load. The interactions receive route at
 * `/api/webhooks/discord` transitively imports the registry so the
 * deactivation hook is available when the receive path runs in a
 * fresh worker process.
 */
registerActivation("discord", "slash_command", activate);
registerDeactivation("discord", "slash_command", deactivate);

export { activate, deactivate };
