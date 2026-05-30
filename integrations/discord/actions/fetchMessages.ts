import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import {
  type DiscordMessage,
  messagesList,
} from "../../_shared/discord/api/messages";
import { isUserVisibleMessage } from "../../_shared/discord/messageFilters";
import {
  FetchMessagesConfigSchema,
  type FetchMessagesFilterType,
} from "./fetchMessages.schema";

/**
 * Discord `fetch_messages` action handler — read-only.
 *
 * GETs `/channels/{channelId}/messages` (newest-first per Discord
 * default), then applies the chosen `filterType` filter in-process.
 * When a filter is active, fetches `limit * 3` (capped at 100) so the
 * post-filter result has a decent chance of hitting `limit` matches.
 *
 * **Filter semantics (mirrors V1 lib/workflows/actions/discord.ts:1218-1405):**
 *   - `"none"` — no filter.
 *   - `"author"` — `author.id === filterAuthor`.
 *   - `"content"` — `content.includes(filterContent)` (case-controlled).
 *   - `"has_attachments"` — `attachments.length > 0`.
 *   - `"has_embeds"` — `embeds.length > 0`.
 *   - `"is_pinned"` — `pinned === true`.
 *   - `"from_bots"` — `author.bot === true`.
 *   - `"from_humans"` — `author.bot !== true`.
 *   - `"has_reactions"` — `reactions.length > 0`.
 *
 * **System-message filtering:** Discord's message stream includes
 * system messages (joins, pins, boost notifications — `type !== 0`).
 * V1 strips system messages from `fetch_messages` output unless they
 * carry attachments or embeds (rare but possible — pin-message
 * sometimes echoes the pinned content). V2 mirrors that behavior.
 *
 * **Sort order:** Discord returns newest-first by default. When the
 * caller requests `sortOrder = "oldest"`, the post-filter array is
 * reversed in-place before being trimmed to `limit`.
 *
 * Output shape:
 *   {
 *     messages: Array<{ id, content, timestamp, editedTimestamp,
 *                       author: { id, username, globalName, bot },
 *                       channelId, guildId, attachments, embeds, mentions,
 *                       pinned, reactions }>,
 *     count, channelId, filterType, filterApplied, totalFetched
 *   }
 *
 * Each per-message projection is bounded — we do NOT include the raw
 * Discord wire payload in output. The DISCORD-2 slice does not ship
 * ActionMeta so the sensitive-output structural test does not yet
 * apply, but the projection is shaped to keep future Meta wiring
 * straightforward (sensitive flags on `content`, `author.username`,
 * `attachments`, `mentions`).
 */

function projectMessage(msg: DiscordMessage, guildId: string) {
  return {
    id: msg.id,
    content: msg.content ?? "",
    timestamp: msg.timestamp ?? null,
    editedTimestamp: msg.edited_timestamp ?? null,
    author: msg.author
      ? {
          id: msg.author.id,
          username: msg.author.username ?? null,
          globalName: msg.author.global_name ?? null,
          bot: msg.author.bot === true,
        }
      : null,
    channelId: msg.channel_id,
    guildId: msg.guild_id ?? guildId,
    attachments: (msg.attachments ?? []).map((a) => ({
      id: a.id,
      filename: a.filename ?? null,
      size: a.size ?? null,
      url: a.url ?? null,
      contentType: a.content_type ?? null,
    })),
    embeds: msg.embeds ?? [],
    mentions: (msg.mentions ?? []).map((m) => ({
      id: m.id,
      username: m.username ?? null,
    })),
    pinned: msg.pinned === true,
    reactions: (msg.reactions ?? []).map((r) => ({
      name: r.emoji.name,
      count: r.count,
    })),
  };
}

function applyFilter(
  messages: readonly DiscordMessage[],
  filterType: FetchMessagesFilterType,
  filterAuthor: string | undefined,
  filterContent: string | undefined,
  caseSensitive: boolean,
): readonly DiscordMessage[] {
  if (filterType === "none") return messages;
  return messages.filter((msg) => {
    switch (filterType) {
      case "author":
        return msg.author?.id === filterAuthor;
      case "content": {
        const content = msg.content ?? "";
        const needle = filterContent ?? "";
        if (caseSensitive) return content.includes(needle);
        return content.toLowerCase().includes(needle.toLowerCase());
      }
      case "has_attachments":
        return (msg.attachments?.length ?? 0) > 0;
      case "has_embeds":
        return (msg.embeds?.length ?? 0) > 0;
      case "is_pinned":
        return msg.pinned === true;
      case "from_bots":
        return msg.author?.bot === true;
      case "from_humans":
        return msg.author?.bot !== true;
      case "has_reactions":
        return (msg.reactions?.length ?? 0) > 0;
      default:
        return true;
    }
  });
}

// `isUserVisibleMessage` lives in `_shared/discord/messageFilters.ts` —
// the same helper is consumed by the `new_message` polling trigger
// (Slice 3.DISCORD-7) so the system-message filter stays consistent
// across action + trigger surfaces.

export const fetchMessages: ActionHandler = async (input) => {
  const config = FetchMessagesConfigSchema.parse(input.config);

  const integration = await getActiveForExecution(input.accountId, "discord", null);
  if (!integration) {
    throw new Error("No active Discord integration found for this user.");
  }

  // When a filter is active, over-fetch so the result has a chance to
  // hit the requested limit. Discord caps the wire limit at 100.
  const fetchLimit =
    config.filterType === "none"
      ? config.limit
      : Math.min(config.limit * 3, 100);

  const raw = await messagesList({
    channelId: config.channelId,
    limit: fetchLimit,
  });

  const visible = raw.filter(isUserVisibleMessage);
  const filtered = applyFilter(
    visible,
    config.filterType,
    config.filterAuthor,
    config.filterContent,
    config.caseSensitive,
  );

  // Discord returns newest-first; reverse for "oldest" before trimming.
  const ordered =
    config.sortOrder === "oldest" ? [...filtered].reverse() : filtered;
  const trimmed = ordered.slice(0, config.limit);

  return {
    output: {
      messages: trimmed.map((m) => projectMessage(m, config.guildId)),
      count: trimmed.length,
      channelId: config.channelId,
      filterType: config.filterType,
      filterApplied: config.filterType !== "none",
      totalFetched: raw.length,
    },
  };
};
