import { discordBotRequest } from "./_request";

/**
 * Discord REST API v10 `guilds` resource wrappers — Slice 3.DISCORD-3
 * (options resolver layer).
 *
 * Endpoints covered:
 *   - GET /users/@me/guilds                          (botGuildsList)
 *   - GET /guilds/{guildId}/channels                 (guildChannelsList)
 *   - GET /guilds/{guildId}/members?limit=...        (guildMembersList)
 *   - GET /guilds/{guildId}/roles                    (guildRolesList)
 *
 * All authenticated as the global bot. The bot must have been added to
 * the target guild for any per-guild call to succeed; Discord returns
 * 403 (Missing Access) otherwise — surfaced as `DiscordApiError` by the
 * underlying wrapper.
 *
 * **Pagination notes** (V2 returns a single page per call; resolvers
 * advertise `hasMore` when the wire result hit the requested limit):
 *   - `/users/@me/guilds` accepts `before`/`after`/`limit` (max 200).
 *     The vast majority of bot installs are <50 guilds; resolver
 *     fetches a single page of 200 and surfaces `hasMore: true` when
 *     it hits the cap.
 *   - `/guilds/{id}/channels` returns ALL channels in one response
 *     (no pagination); `hasMore: false` always.
 *   - `/guilds/{id}/members` accepts `limit` (max 1000) + `after`
 *     cursor. Single-page fetch only; large servers truncate at 1000.
 *   - `/guilds/{id}/roles` returns ALL roles in one response.
 */

// ─── botGuildsList ──────────────────────────────────────────────────────────

export interface DiscordGuildSummary {
  id: string;
  name: string;
  icon?: string | null;
  owner?: boolean;
  permissions?: string;
  features?: readonly string[];
}

export interface BotGuildsListInput {
  /** Discord max is 200 per page. Defaults to 200. */
  limit?: number;
}

export async function botGuildsList(
  input: BotGuildsListInput = {},
): Promise<readonly DiscordGuildSummary[]> {
  const query = new URLSearchParams();
  query.set("limit", String(Math.min(Math.max(input.limit ?? 200, 1), 200)));
  return discordBotRequest<DiscordGuildSummary[]>({
    method: "GET",
    path: "/users/@me/guilds",
    query,
    resourceForNotFound: "bot guild list",
  });
}

// ─── guildChannelsList ──────────────────────────────────────────────────────

/** Discord channel type enum — text-shaped types only listed below. */
export const DISCORD_CHANNEL_TYPE_GUILD_TEXT = 0;
export const DISCORD_CHANNEL_TYPE_GUILD_VOICE = 2;
export const DISCORD_CHANNEL_TYPE_GUILD_CATEGORY = 4;
export const DISCORD_CHANNEL_TYPE_GUILD_ANNOUNCEMENT = 5;
export const DISCORD_CHANNEL_TYPE_GUILD_STAGE_VOICE = 13;
export const DISCORD_CHANNEL_TYPE_GUILD_FORUM = 15;
export const DISCORD_CHANNEL_TYPE_GUILD_MEDIA = 16;

export interface DiscordChannelSummary {
  id: string;
  name?: string;
  /** Discord channel type — 0=text, 2=voice, 4=category, 5=announcement, 15=forum, ... */
  type?: number;
  position?: number;
  parent_id?: string | null;
  topic?: string | null;
  nsfw?: boolean;
}

export interface GuildChannelsListInput {
  guildId: string;
}

export async function guildChannelsList(
  input: GuildChannelsListInput,
): Promise<readonly DiscordChannelSummary[]> {
  return discordBotRequest<DiscordChannelSummary[]>({
    method: "GET",
    path: `/guilds/${encodeURIComponent(input.guildId)}/channels`,
    resourceForNotFound: `guild ${input.guildId}`,
  });
}

// ─── guildMembersList ───────────────────────────────────────────────────────

export interface DiscordGuildMember {
  user?: {
    id: string;
    username?: string;
    global_name?: string | null;
    discriminator?: string;
    avatar?: string | null;
    bot?: boolean;
  };
  nick?: string | null;
  roles?: readonly string[];
  joined_at?: string;
}

export interface GuildMembersListInput {
  guildId: string;
  /** Discord max is 1000 per page. Defaults to 1000. */
  limit?: number;
  /** Optional cursor — only members whose id is greater. */
  after?: string;
}

export async function guildMembersList(
  input: GuildMembersListInput,
): Promise<readonly DiscordGuildMember[]> {
  const query = new URLSearchParams();
  query.set("limit", String(Math.min(Math.max(input.limit ?? 1000, 1), 1000)));
  if (input.after) query.set("after", input.after);
  return discordBotRequest<DiscordGuildMember[]>({
    method: "GET",
    path: `/guilds/${encodeURIComponent(input.guildId)}/members`,
    query,
    resourceForNotFound: `guild ${input.guildId} members`,
  });
}

// ─── guildRolesList ─────────────────────────────────────────────────────────

export interface DiscordRoleSummary {
  id: string;
  name: string;
  color?: number;
  position?: number;
  permissions?: string;
  /**
   * `managed: true` indicates the role is owned by a Discord
   * integration (bot's own auto-created role, Server Booster role,
   * integrations like Twitch sub roles). These roles cannot be
   * manually assigned via the API — Discord blocks the PUT — so the
   * options resolver filters them out.
   */
  managed?: boolean;
  mentionable?: boolean;
  hoist?: boolean;
}

export interface GuildRolesListInput {
  guildId: string;
}

export async function guildRolesList(
  input: GuildRolesListInput,
): Promise<readonly DiscordRoleSummary[]> {
  return discordBotRequest<DiscordRoleSummary[]>({
    method: "GET",
    path: `/guilds/${encodeURIComponent(input.guildId)}/roles`,
    resourceForNotFound: `guild ${input.guildId} roles`,
  });
}
