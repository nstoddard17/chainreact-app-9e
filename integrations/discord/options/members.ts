import { guildMembersList } from "@/integrations/_shared/discord/api/guilds";
import { NotFoundError } from "@/integrations/_shared/discord/errors";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { classifyDiscordResolverError } from "./_errors";

/**
 * `discord:members` options resolver — Slice 3.DISCORD-3.
 *
 * Backs:
 *   - `userId` on `discord:assign_role` (the member receiving the role).
 *   - `userIds[]` on `discord:delete_message` (the author filter).
 *   - `filterAuthor` on `discord:fetch_messages` (author filter mode).
 *
 * Depends on the parent `guildId` field.
 *
 * Behavior:
 *   - `requiresIntegration: true`.
 *   - `requiredDeps: ["guildId"]` — V1 field name verbatim.
 *   - Calls `GET /guilds/{guildId}/members?limit=1000`. Discord caps
 *     a single page at 1000; resolver advertises `hasMore: true` when
 *     the wire result hits the cap (large servers need future cursor
 *     pagination — out of scope for this slice).
 *   - **Bot membership privilege requirement:** Discord requires the
 *     bot to have the GUILD_MEMBERS *Privileged Intent* enabled in
 *     the Developer Portal AND requested at gateway connection to
 *     receive full member lists via the REST API. Without the intent
 *     enabled, Discord returns only the bot's own member entry. The
 *     resolver doesn't enforce this — surfaces whatever Discord
 *     returns. Documented here so deploy operators know what to flip
 *     in the Developer Portal.
 *   - Maps each member to:
 *       - `value`: member.user.id
 *       - `label`: nick → global_name → username → user.id (priority order)
 *       - `description`: username (when label is not username, for
 *         disambiguation between display name + handle)
 *   - Filters out members whose user record is missing / botless
 *     entries with no user object (Discord can return these in rare
 *     edge cases for in-flight member fetches).
 *   - Client-side case-insensitive substring filter on `label`.
 *   - Guild-deleted / bot-not-in-guild → empty items (no throw).
 */
export const discordMembersResolver: OptionsResolver = {
  source: "discord:members",
  provider: "discord",
  requiresIntegration: true,
  requiredDeps: ["guildId"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Discord integration. Connect Discord first.",
      );
    }

    const guildId = ctx.deps.guildId;
    if (typeof guildId !== "string" || guildId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a Discord server first.",
      );
    }

    let members;
    try {
      members = await guildMembersList({ guildId, limit: 1000 });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return { items: [], hasMore: false };
      }
      throw classifyDiscordResolverError(err, "members");
    }

    const mapped = members
      .filter((m) => m.user && typeof m.user.id === "string" && m.user.id.length > 0)
      .map((m) => {
        const user = m.user!;
        const nick = m.nick && m.nick.length > 0 ? m.nick : null;
        const globalName =
          user.global_name && user.global_name.length > 0 ? user.global_name : null;
        const username = user.username && user.username.length > 0 ? user.username : null;
        const label = nick ?? globalName ?? username ?? user.id;
        const description =
          username && username !== label ? username : undefined;
        return description !== undefined
          ? { value: user.id, label, description }
          : { value: user.id, label };
      });

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? mapped.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : mapped;

    return {
      items: filtered,
      hasMore: members.length >= 1000,
    };
  },
};
