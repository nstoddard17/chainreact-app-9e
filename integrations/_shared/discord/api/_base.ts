/**
 * Shared Discord REST API base — pinned version, origin, bot-token
 * resolver, URL builder.
 *
 * Slice 3.DISCORD-2 (runtime port). Discord differs from every prior
 * V2 provider on the auth model:
 *
 *   - **One global bot token** for the entire deployment, sourced
 *     from `DISCORD_BOT_TOKEN`. Not per-user, not per-guild, not
 *     stored on integration rows. Discord's architecture: ChainReact
 *     registers a single bot application; users add THAT bot to
 *     their guilds via Discord's "Add to Server" OAuth picker. Every
 *     subsequent API call authenticates as the bot.
 *
 *   - **User-identity OAuth row** (`integrations.access_token_encrypted`
 *     for Discord) tracks WHICH ChainReact user has linked their
 *     Discord identity. The user-OAuth token is captured at callback
 *     time (`integrations/discord/oauth.ts`) but is NOT used for
 *     action-call auth. Action handlers read the bot token from env
 *     and call Discord directly.
 *
 * The single-host origin is env-overridable for e2e testing.
 * Production sets nothing; default points at `https://discord.com`.
 * The override is opt-in (must be set explicitly), can't be reached
 * accidentally, and lives at the network boundary — token resolution +
 * dispatcher paths run unchanged regardless.
 *
 * `DISCORD_API_VERSION = "v10"` — Discord's REST API version. Embedded
 * directly in the URL path (`/api/v10/...`). Sent as a path segment,
 * not as a header. Bumping is a single-line edit here.
 *
 * Mirrors V1 `lib/workflows/actions/discord.ts` which hardcodes
 * `https://discord.com/api/v10/...` in every handler. V2 centralizes
 * the version + host through this module so a future API-version bump
 * is one edit, not 23.
 */

import { DiscordBotTokenMissingError } from "../errors";

/** Discord's REST API version pinned by V2. */
export const DISCORD_API_VERSION = "v10";

/**
 * Discord API origin. Production: `https://discord.com`. Test override:
 * set `DISCORD_API_BASE` to a localhost mock origin.
 */
export function discordApiOrigin(): string {
  return process.env.DISCORD_API_BASE ?? "https://discord.com";
}

/**
 * Build a fully-qualified Discord REST URL.
 *
 * Path SHOULD start with a leading slash (e.g. `"/channels/123/messages"`);
 * leading-slash normalization is applied so callers can pass either form
 * without breaking the URL.
 */
export function discordApiUrl(path: string): string {
  const origin = discordApiOrigin();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${origin}/api/${DISCORD_API_VERSION}${normalized}`;
}

/**
 * Resolve the global Discord bot token from the process env.
 *
 * Throws `DiscordBotTokenMissingError` when unset — a missing env
 * value at action time means the deploy is misconfigured; we fail
 * loud so the operator sees a clear error rather than a `Bot
 * undefined` request hitting Discord.
 */
export function getDiscordBotToken(): string {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || token.length === 0) {
    throw new DiscordBotTokenMissingError();
  }
  return token;
}
