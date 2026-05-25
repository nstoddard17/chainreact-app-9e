import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";
import { NotFoundError } from "@/integrations/_shared/discord/errors";
import { guildCommandDelete } from "@/integrations/_shared/discord/api/applications";

/**
 * Discord `slash_command` deactivation hook — Slice 3.DISCORD-6.
 *
 * Reads `trigger_resources.config.{applicationId, guildId, commandId}`
 * and DELETEs the guild-scoped slash command on Discord. Best-effort:
 *   - 404 (`NotFoundError`) → swallow. The command is already gone
 *     server-side (operator deleted it manually, bot was kicked from
 *     the guild, application was removed). Activation didn't depend on
 *     the cleanup, so we don't punish disable/delete for a state we
 *     can't observe.
 *   - 401 (`DiscordApiError` with status 401, name set by the shared
 *     request helper) → propagate. Bot token is invalid; operator must
 *     rotate `DISCORD_BOT_TOKEN`. The lifecycle orchestrator catches
 *     and logs; row deletion still proceeds.
 *   - 403 (bot not in guild, missing permission) → propagate. The
 *     orchestrator's catch-and-log keeps the disable transition
 *     non-blocking, but a 403 here is worth surfacing so operators see
 *     when guild access has lapsed.
 *   - Other errors → propagate (orchestrator catches in
 *     `services/triggers/lifecycle.ts`).
 *
 * Skips silently when any of `applicationId` / `guildId` / `commandId`
 * is missing from the config — the row was registered but the
 * activation hook never persisted them (early test fixtures,
 * partial-activation rollback, etc.).
 *
 * Mirrors `integrations/github/triggers/newCommit/deactivate.ts` shape
 * — best-effort delete, swallow 404, propagate everything else.
 */
export const deactivate: DeactivationFn = async ({ trigger }) => {
  const config = trigger.config as {
    applicationId?: string;
    guildId?: string;
    commandId?: string;
  };
  const { applicationId, guildId, commandId } = config;
  if (
    typeof applicationId !== "string" ||
    applicationId.length === 0 ||
    typeof guildId !== "string" ||
    guildId.length === 0 ||
    typeof commandId !== "string" ||
    commandId.length === 0
  ) {
    return;
  }

  try {
    await guildCommandDelete({ applicationId, guildId, commandId });
  } catch (err) {
    if (err instanceof NotFoundError) return;
    throw err;
  }
};
