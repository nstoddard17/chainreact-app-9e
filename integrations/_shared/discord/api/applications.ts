import { discordBotRequest } from "./_request";

/**
 * Discord REST API v10 `applications/{app_id}/guilds/{guild_id}/commands`
 * wrappers — Slice 3.DISCORD-6 (slash-command trigger).
 *
 * Per Discord docs (https://discord.com/developers/docs/interactions/application-commands):
 *
 *   - **Guild-scoped commands** are registered per (application, guild)
 *     pair. Updates propagate instantly (no global-command 1-hour cache
 *     wait). V2 uses guild-scoped registration exclusively because every
 *     V2 slash-command trigger is bound to a single guild at activation
 *     time.
 *   - **Auth.** Bot token (`Authorization: Bot <token>`) per
 *     `discordBotRequest`. The application id is required in the path
 *     and is sourced from `DISCORD_APPLICATION_ID` env (the
 *     application's snowflake id from the Discord Developer Portal,
 *     distinct from the bot user id).
 *   - **Idempotency.** `POST .../commands` creates OR updates the
 *     command if one with the same name already exists for this
 *     (application, guild). V2 uses POST (not PUT) for activate — Discord
 *     treats POST as upsert by name, so re-activating an existing
 *     workflow won't 409-fail.
 *   - **Deactivation.** `DELETE .../commands/{command_id}` removes one
 *     specific command (identified by the snowflake id returned at
 *     create time). Best-effort 404 swallow lives at the deactivate
 *     hook — this helper just propagates whatever `discordBotRequest`
 *     throws.
 *
 * Mirrors `integrations/_shared/github/api/webhooks.ts` shape — one
 * resource wrapper per endpoint, typed input/output, NotFoundError
 * surfaces via the shared request helper.
 *
 * **Out of scope for this slice.**
 *   - Global (non-guild) commands. V2 may add a global-command resolver
 *     in a future slice, but the slash-command trigger is per-guild.
 *   - Command options (subcommands / parameters). Discord supports a
 *     rich option-tree shape on commands; this wrapper accepts an
 *     opaque `options` array so the activate hook can pass a Discord-
 *     native array verbatim. The slash-command meta in DISCORD-6 does
 *     NOT surface options to workflow authors — that lands in a
 *     follow-up polish slice. The wrapper supports it ahead of time so
 *     the API surface doesn't change later.
 */

/** Discord `ApplicationCommand` resource — minimal shape V2 uses. */
export interface DiscordApplicationCommand {
  /** Snowflake id assigned by Discord on creation. */
  id: string;
  /** Application id (echoed). */
  application_id: string;
  /** Guild id (echoed for guild-scoped commands). */
  guild_id?: string;
  /** Command name as registered (1-32 chars, lowercase, /^[-_\p{L}\p{N}]+$/). */
  name: string;
  /** Command description (1-100 chars). */
  description: string;
  /**
   * Command type — `1` = CHAT_INPUT (slash). V2 only registers slash
   * commands; `USER` / `MESSAGE` context-menu commands are out of scope.
   */
  type?: number;
  /** Optional option tree — opaque to V2. */
  options?: readonly unknown[];
}

/**
 * Resolve the application id from env. Distinct from the bot user id —
 * the application id is the snowflake of the Discord application that
 * owns the bot, surfaced in the Developer Portal under "General
 * Information → Application ID".
 *
 * Throws when unset — activate hook fails-closed at design time so the
 * misconfig never reaches a workflow's first run.
 */
export function getDiscordApplicationId(): string {
  const id = process.env.DISCORD_APPLICATION_ID;
  if (!id || id.length === 0) {
    throw new Error(
      "Discord application id is not configured. Set DISCORD_APPLICATION_ID in the server env. " +
        "The application id is the snowflake of the Discord application that owns the bot, " +
        "found in the Discord Developer Portal under 'General Information → Application ID'.",
    );
  }
  return id;
}

export interface GuildCommandCreateInput {
  applicationId: string;
  guildId: string;
  name: string;
  description: string;
  /**
   * Optional option tree (subcommands / parameters). Forwarded verbatim
   * — not validated client-side. Discord rejects malformed option
   * shapes at the API layer.
   */
  options?: readonly unknown[];
}

/**
 * Register (upsert) a guild-scoped slash command.
 *
 * Discord's POST endpoint upserts by name within (application, guild) —
 * if a command with the same name already exists, the existing record
 * is updated and its id returned. This means re-activating a workflow
 * with the same slash command does NOT 409.
 */
export async function guildCommandCreate(
  input: GuildCommandCreateInput,
): Promise<DiscordApplicationCommand> {
  const body: Record<string, unknown> = {
    name: input.name,
    description: input.description,
    type: 1, // CHAT_INPUT (slash)
  };
  if (input.options !== undefined) {
    body.options = input.options;
  }
  return discordBotRequest<DiscordApplicationCommand>({
    method: "POST",
    path: `/applications/${encodeURIComponent(input.applicationId)}/guilds/${encodeURIComponent(
      input.guildId,
    )}/commands`,
    body,
    resourceForNotFound: `application ${input.applicationId} guild ${input.guildId}`,
  });
}

export interface GuildCommandDeleteInput {
  applicationId: string;
  guildId: string;
  commandId: string;
}

/**
 * Delete a single guild-scoped slash command by id. Discord returns 204
 * on success; the underlying `discordBotRequest` resolves with `null`.
 * 404 surfaces as `NotFoundError` — deactivate hook swallows that
 * (best-effort cleanup; the operator may have deleted it manually).
 */
export async function guildCommandDelete(
  input: GuildCommandDeleteInput,
): Promise<void> {
  await discordBotRequest<null>({
    method: "DELETE",
    path: `/applications/${encodeURIComponent(input.applicationId)}/guilds/${encodeURIComponent(
      input.guildId,
    )}/commands/${encodeURIComponent(input.commandId)}`,
    resourceForNotFound: `application ${input.applicationId} guild ${input.guildId} command ${input.commandId}`,
  });
}
