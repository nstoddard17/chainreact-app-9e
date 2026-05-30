import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { DiscordMessage } from "@/integrations/_shared/discord/api/messages";

/**
 * Convert a Discord message into V2's canonical `TriggerEvent` —
 * Slice 3.DISCORD-7.
 *
 * Mirrors V1 `discord_trigger_new_message` payload at
 * `lib/workflows/nodes/providers/discord/index.ts` — 11 fields:
 * `messageId / content / authorId / authorName / channelId /
 * channelName / guildId / guildName / timestamp / attachments[] /
 * mentions[]`.
 *
 * **Sensitive output handling.** The newMessage meta marks `content`
 * / `authorName` / `attachments` / `mentions` as sensitive per
 * DISCORD-1 §5.2. This normalize function does NOT redact — it
 * surfaces everything; the run-detail API + variable picker preview
 * consult the meta's `sensitive: true` flags at render time.
 *
 * **No raw escape hatch.** Unlike the slash-command trigger (which
 * forwards an `interaction` raw body for fields V2 doesn't surface),
 * the new_message payload is the full bounded projection — message
 * shape is small and well-understood. Adding a raw escape hatch here
 * would expose Discord wire fields we don't yet have a sensitive-flag
 * audit for.
 *
 * **channelName / guildName resolution.** The Discord `messages` API
 * doesn't include the channel name or guild name in each message
 * payload — those need a separate lookup. V2 v1 surfaces them as
 * `null` when not present in the message payload; if/when product
 * needs them, a follow-up slice can plumb channel/guild metadata
 * through the trigger config (already-cached values from
 * `discord:channels` / `discord:guilds` resolvers at activation time).
 * Documenting as a known limitation rather than synthesizing wrong
 * values.
 */

export const DISCORD_TRIGGER_EVENT_TYPE = "new_message";

export interface NormalizeNewMessageInput {
  /** A single Discord message from `messagesList`. */
  message: DiscordMessage;
  /** Echo-through guild id from the trigger config. */
  guildId: string;
}

interface ProjectedAttachment {
  id: string;
  filename: string | null;
  size: number | null;
  url: string | null;
  contentType: string | null;
}

interface ProjectedMention {
  id: string;
  username: string | null;
}

function projectAttachments(
  msg: DiscordMessage,
): readonly ProjectedAttachment[] {
  return (msg.attachments ?? []).map((a) => ({
    id: a.id,
    filename: a.filename ?? null,
    size: a.size ?? null,
    url: a.url ?? null,
    contentType: a.content_type ?? null,
  }));
}

function projectMentions(msg: DiscordMessage): readonly ProjectedMention[] {
  return (msg.mentions ?? []).map((m) => ({
    id: m.id,
    username: m.username ?? null,
  }));
}

export function normalizeNewMessage(
  input: NormalizeNewMessageInput,
): TriggerEvent {
  const { message, guildId } = input;
  const occurredAt =
    typeof message.timestamp === "string" && message.timestamp.length > 0
      ? message.timestamp
      : new Date().toISOString();

  return {
    provider: "discord",
    eventType: DISCORD_TRIGGER_EVENT_TYPE,
    eventId: message.id,
    occurredAt,
    // providerAccountId: the guild id. Mirrors slash_command's accountId
    // semantics — per-guild dispatch fan-out + downstream variable
    // pickers branch off this.
    providerAccountId: guildId,
    payload: {
      messageId: message.id,
      content: message.content ?? "",
      authorId: message.author?.id ?? null,
      authorName:
        message.author?.username ?? message.author?.global_name ?? null,
      channelId: message.channel_id,
      // channelName / guildName are not present in the raw message
      // payload — see file header. Surfaced as null until a follow-up
      // plumbs the names through trigger config.
      channelName: null,
      guildId,
      guildName: null,
      timestamp: message.timestamp ?? null,
      attachments: projectAttachments(message),
      mentions: projectMentions(message),
    },
  };
}
