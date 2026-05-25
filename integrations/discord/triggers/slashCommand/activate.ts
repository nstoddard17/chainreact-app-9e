import type { ActivationFn } from "@/services/triggers/activationRegistry";
import {
  getDiscordApplicationId,
  guildCommandCreate,
  type DiscordApplicationCommand,
} from "@/integrations/_shared/discord/api/applications";

/**
 * Discord `slash_command` activation hook — Slice 3.DISCORD-6.
 *
 * Registers a guild-scoped slash command with Discord at workflow-
 * activate time.
 *
 * Reads `node.config`:
 *   - `guildId` (REQUIRED) — the Discord server (guild) the command
 *     will be registered in. Picker is `discord:guilds`; the bot must
 *     already be installed in this guild for the registration to
 *     succeed.
 *   - `commandName` (REQUIRED) — slash-command name (1-32 chars,
 *     lowercase, `/^[-_a-z0-9]+$/`). Discord's full name regex
 *     (`/^[-_\p{L}\p{N}]+$/u`) is more permissive but V2 enforces the
 *     ASCII subset for predictability across V2 internals + audit log
 *     readability. Surfaced WITHOUT the leading `/` — Discord adds it
 *     in the UI.
 *   - `commandDescription` (REQUIRED) — 1-100 chars per Discord spec.
 *
 * **Idempotent re-activation.** Discord's POST endpoint upserts by name
 * within (application, guild), so re-activating an existing workflow
 * with the same `commandName` returns the existing command id rather
 * than 409-failing. Activating with a CHANGED name creates a new
 * command; the deactivate hook then needs the OLD id to clean up the
 * old command — which is why the persisted `commandId` matters.
 *
 * Persists in `trigger_resources.config`:
 *   - `webhookEnabled: true` (parity with other V2 webhook triggers).
 *   - `applicationId` — captured at activate time so deactivate doesn't
 *     re-read env (defense if the env var rotates between
 *     activate/deactivate).
 *   - `guildId`, `commandName`, `commandDescription` — echoed.
 *   - `commandId` — the snowflake Discord assigned to the registered
 *     command. Used by deactivate for the DELETE call.
 *
 * **NO `type: "subscription-watch"` field.** Discord slash commands
 * don't expire (Discord persists registrations until the bot or the
 * command is deleted). The `runRenewals` cron filters on
 * `config.type === "subscription-watch"` — this trigger's activate
 * intentionally omits the marker so the renewal cron never picks it
 * up. Same "permanent endpoint" pattern as Stripe / GitHub.
 *
 * **Notification URL is not configured here.** Discord's interactions
 * endpoint URL is configured ONCE per Discord application in the
 * Developer Portal — it's deployment-wide, not per-workflow. The
 * receive route at `/api/webhooks/discord` uses
 * `?workflowId=X&nodeId=Y` query params for strict-direct-lookup, but
 * those params come from the ?workflowId / ?nodeId query the route
 * carries via the (provider, eventType) dispatch fan-out — slash-
 * command interactions arrive at the global URL and the route looks
 * up the matching trigger_resources row by guildId + commandName.
 *
 * Throws abort the activate transition (TRIGGER_REGISTRATION_FAILED).
 */

export const activate: ActivationFn = async ({ node }) => {
  const config = node.config ?? {};

  const guildId = config.guildId;
  if (typeof guildId !== "string" || guildId.length === 0) {
    throw new Error(
      "discord slash_command activate: node.config.guildId is required (Discord server snowflake id).",
    );
  }

  const commandName = config.commandName;
  if (typeof commandName !== "string" || commandName.length === 0) {
    throw new Error(
      "discord slash_command activate: node.config.commandName is required (1-32 chars, lowercase, /^[-_a-z0-9]+$/).",
    );
  }
  if (commandName.length > 32) {
    throw new Error(
      `discord slash_command activate: commandName must be 32 characters or fewer (got ${commandName.length}).`,
    );
  }
  if (!/^[-_a-z0-9]+$/.test(commandName)) {
    throw new Error(
      `discord slash_command activate: commandName must match /^[-_a-z0-9]+$/ (got '${commandName}'). Discord requires lowercase; V2 enforces the ASCII subset for predictability.`,
    );
  }

  const commandDescription = config.commandDescription;
  if (
    typeof commandDescription !== "string" ||
    commandDescription.length === 0
  ) {
    throw new Error(
      "discord slash_command activate: node.config.commandDescription is required (1-100 chars).",
    );
  }
  if (commandDescription.length > 100) {
    throw new Error(
      `discord slash_command activate: commandDescription must be 100 characters or fewer (got ${commandDescription.length}).`,
    );
  }

  const applicationId = getDiscordApplicationId();

  const created: DiscordApplicationCommand = await guildCommandCreate({
    applicationId,
    guildId,
    name: commandName,
    description: commandDescription,
  });

  return {
    webhookEnabled: true,
    applicationId,
    guildId,
    commandName,
    commandDescription,
    commandId: created.id,
  };
};
