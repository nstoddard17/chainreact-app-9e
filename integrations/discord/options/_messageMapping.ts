import type { DiscordMessage } from "@/integrations/_shared/discord/api/messages";

/**
 * Shared message → OptionItem mapping helper for the two
 * message-picker resolvers (`discord:bot_messages` +
 * `discord:messages`) — Slice 3.DISCORD-3.
 *
 * Discord messages don't have a "title" surface; the only sensible
 * label for a picker is the message content. We:
 *   - Trim whitespace.
 *   - Truncate to 60 chars + ellipsis when longer.
 *   - Use the message timestamp as a description for disambiguation.
 *   - Fall back to a placeholder when the message has no content
 *     (Discord allows attachment-only / embed-only messages with
 *     empty `content` strings).
 *
 * `description` is the ISO timestamp Discord returned — picker
 * renderers can format it client-side if they want a human-readable
 * "2 minutes ago" shape.
 */

const MAX_LABEL_CHARS = 60;

export interface MessageOption {
  value: string;
  label: string;
  description?: string;
}

export function mapMessageToOption(msg: DiscordMessage): MessageOption {
  const content = (msg.content ?? "").trim();
  let label: string;
  if (content.length === 0) {
    const attachmentCount = msg.attachments?.length ?? 0;
    const embedCount = msg.embeds?.length ?? 0;
    if (attachmentCount > 0) {
      label = `(${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"})`;
    } else if (embedCount > 0) {
      label = `(${embedCount} embed${embedCount === 1 ? "" : "s"})`;
    } else {
      label = "(empty message)";
    }
  } else if (content.length <= MAX_LABEL_CHARS) {
    label = content;
  } else {
    label = `${content.slice(0, MAX_LABEL_CHARS).trimEnd()}…`;
  }

  return msg.timestamp
    ? { value: msg.id, label, description: msg.timestamp }
    : { value: msg.id, label };
}
