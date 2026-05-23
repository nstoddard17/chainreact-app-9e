import type { DiscordMessage } from "./api/messages";

/**
 * Shared Discord message-filter helpers — Slice 3.DISCORD-7
 * (factored out of the `fetch_messages` action so the
 * `new_message` polling trigger can reuse the same system-message
 * filter logic).
 *
 * V1 reference: `lib/workflows/actions/discord.ts:isUserVisibleMessage`
 * around line 1218. V2 mirrors that semantics verbatim — anything
 * other than `type === 0` (DEFAULT) is a Discord-generated system
 * message (joins, pin notifications, boost messages, server icon
 * updates, etc.) EXCEPT when the system message carries attachments
 * or embeds (rare but possible — Discord occasionally echoes
 * pinned-message content via a system message that still has the
 * original attachments).
 *
 * Keeping this helper in `_shared/` rather than in
 * `integrations/discord/actions/` lets the trigger module import it
 * without crossing the action / trigger boundary. The action
 * handler imports from here too — single source of truth.
 */
export function isUserVisibleMessage(msg: DiscordMessage): boolean {
  // Discord MessageType.DEFAULT === 0; undefined means a malformed or
  // partial payload — treat as visible so we don't silently drop the
  // event (the runtime contract is "filter system messages out", not
  // "filter anything we don't understand").
  if (msg.type === undefined || msg.type === 0) return true;
  if ((msg.attachments?.length ?? 0) > 0) return true;
  if ((msg.embeds?.length ?? 0) > 0) return true;
  return false;
}
