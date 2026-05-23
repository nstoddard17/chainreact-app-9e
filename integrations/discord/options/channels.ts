import {
  DISCORD_CHANNEL_TYPE_GUILD_ANNOUNCEMENT,
  DISCORD_CHANNEL_TYPE_GUILD_FORUM,
  DISCORD_CHANNEL_TYPE_GUILD_TEXT,
  guildChannelsList,
} from "@/integrations/_shared/discord/api/guilds";
import { NotFoundError } from "@/integrations/_shared/discord/errors";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { classifyDiscordResolverError } from "./_errors";

/**
 * `discord:channels` options resolver — Slice 3.DISCORD-3.
 *
 * Backs the `channelId` picker on all 4 message actions
 * (send_message, edit_message, delete_message, fetch_messages).
 * Depends on the parent `guildId` field.
 *
 * Behavior:
 *   - `requiresIntegration: true`.
 *   - `requiredDeps: ["guildId"]` — dep name preserved verbatim from
 *     V1 (camelCase, NOT snake_case `guild_id`).
 *   - Calls `GET /guilds/{guildId}/channels` (returns ALL channels;
 *     no pagination).
 *   - **Filter:** only TEXT-shaped channel types are surfaced:
 *       - 0  GUILD_TEXT          (regular text channel)
 *       - 5  GUILD_ANNOUNCEMENT  (announcement / news channel)
 *       - 15 GUILD_FORUM         (forum channel root)
 *     Voice (2), stage (13), category (4), media (16), and thread
 *     types are excluded — the 5 ported actions all target text-shaped
 *     surfaces, and surfacing other types would invite confusing 403s.
 *   - Maps each channel to:
 *       - `value`: channel id
 *       - `label`: `#${channel.name}` (fallback to id)
 *       - `description`: `topic.trim()` when non-empty
 *   - Client-side case-insensitive substring filter on `label`.
 *   - `hasMore: false` — Discord returns all channels in one response.
 *   - If the guild has been deleted / bot is no longer in it →
 *     returns empty items rather than throwing (mirrors HubSpot
 *     pipeline-not-found pattern; cascade clears child fields).
 */

const TEXT_SHAPED_CHANNEL_TYPES: ReadonlySet<number> = new Set([
  DISCORD_CHANNEL_TYPE_GUILD_TEXT,
  DISCORD_CHANNEL_TYPE_GUILD_ANNOUNCEMENT,
  DISCORD_CHANNEL_TYPE_GUILD_FORUM,
]);

export const discordChannelsResolver: OptionsResolver = {
  source: "discord:channels",
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

    let channels;
    try {
      channels = await guildChannelsList({ guildId });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return { items: [], hasMore: false };
      }
      throw classifyDiscordResolverError(err, "channels");
    }

    const mapped = channels
      .filter(
        (c) =>
          typeof c.id === "string" &&
          c.id.length > 0 &&
          typeof c.type === "number" &&
          TEXT_SHAPED_CHANNEL_TYPES.has(c.type),
      )
      .map((c) => {
        const name = c.name && c.name.length > 0 ? c.name : null;
        const label = name ? `#${name}` : c.id;
        const topic = c.topic?.trim();
        return topic && topic.length > 0
          ? { value: c.id, label, description: topic }
          : { value: c.id, label };
      });

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? mapped.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : mapped;

    return { items: filtered, hasMore: false };
  },
};
