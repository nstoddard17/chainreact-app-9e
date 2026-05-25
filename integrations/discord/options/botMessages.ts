import { messagesList } from "@/integrations/_shared/discord/api/messages";
import { currentBotUser } from "@/integrations/_shared/discord/api/users";
import { NotFoundError } from "@/integrations/_shared/discord/errors";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { classifyDiscordResolverError } from "./_errors";
import { mapMessageToOption } from "./_messageMapping";

/**
 * `discord:bot_messages` options resolver — Slice 3.DISCORD-3.
 *
 * Used by the future `discord:edit_message` ActionMeta for the
 * `messageId` picker. Discord enforces that bots can only edit
 * messages they authored themselves — so the picker MUST be filtered
 * to bot-authored messages, never the entire channel history. Per
 * Slice 3.DISCORD-1 §3.3 decision D-DC2 this is the dedicated
 * "edit-pickers-only" resolver; `discord:messages` is the
 * unfiltered analog used by `delete_message`.
 *
 * Depends on the parent `channelId` field.
 *
 * Behavior:
 *   - `requiresIntegration: true`.
 *   - `requiredDeps: ["channelId"]` — V1 field name verbatim.
 *   - Calls `GET /users/@me` to learn the bot's own user id (one
 *     extra round-trip per resolver call; cheap, Discord's identity
 *     endpoint is fast). A future caching layer could memoize this
 *     for the process lifetime since the bot id is stable.
 *   - Calls `GET /channels/{channelId}/messages?limit=100`.
 *   - Filters to `author.id === botUserId`.
 *   - Maps via shared `mapMessageToOption` (label = trimmed content
 *     truncated to 60 chars + …; description = ISO timestamp).
 *   - Client-side case-insensitive substring filter on label.
 *   - Channel-deleted / no-access → empty items (no throw).
 *   - `hasMore: false` — V1 doesn't paginate; if the bot's last
 *     edit-eligible message is older than the most-recent 100 in
 *     the channel, the workflow author falls back to entering the
 *     `messageId` directly via a variable or template.
 */
export const discordBotMessagesResolver: OptionsResolver = {
  source: "discord:bot_messages",
  provider: "discord",
  requiresIntegration: true,
  requiredDeps: ["channelId"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Discord integration. Connect Discord first.",
      );
    }

    const channelId = ctx.deps.channelId;
    if (typeof channelId !== "string" || channelId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a Discord channel first.",
      );
    }

    let botUserId: string;
    try {
      const me = await currentBotUser();
      botUserId = me.id;
    } catch (err) {
      throw classifyDiscordResolverError(err, "bot identity");
    }

    let messages;
    try {
      messages = await messagesList({ channelId, limit: 100 });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return { items: [], hasMore: false };
      }
      throw classifyDiscordResolverError(err, "messages");
    }

    const botAuthored = messages.filter((m) => m.author?.id === botUserId);
    const mapped = botAuthored.map(mapMessageToOption);

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? mapped.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : mapped;

    return { items: filtered, hasMore: false };
  },
};
