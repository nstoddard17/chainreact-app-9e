import { discordBotRequest } from "./_request";

/**
 * Discord REST API v10 `messages` resource wrappers — Slice 3.DISCORD-2
 * (runtime port).
 *
 * Endpoints covered:
 *   - POST   /channels/{channelId}/messages                       (messageCreate)
 *   - PATCH  /channels/{channelId}/messages/{messageId}           (messageEdit)
 *   - DELETE /channels/{channelId}/messages/{messageId}           (messageDelete — single)
 *   - POST   /channels/{channelId}/messages/bulk-delete           (messagesBulkDelete — 2-100)
 *   - GET    /channels/{channelId}/messages                       (messagesList)
 *
 * Bot-token auth is owned by `_request.ts` — wrappers never see or pass
 * a token argument.
 *
 * **`messagesBulkDelete` caveats** (Discord-enforced; V1 mirrored these):
 *   - Min 2, max 100 message IDs per call.
 *   - All messages must be newer than 14 days. Older messages → 400.
 *     Callers must fall back to single `messageDelete` calls for older
 *     messages.
 *
 * **`messagesList` ordering:** Discord returns newest-first by default
 * (no `before` / `after` cursor). Callers that want oldest-first
 * reverse the array client-side.
 */

// ─── Discord message shape (bounded — V2 surface only) ──────────────────────

export interface DiscordMessageAuthor {
  id: string;
  username?: string;
  global_name?: string | null;
  discriminator?: string;
  avatar?: string | null;
  bot?: boolean;
}

export interface DiscordMessageAttachment {
  id: string;
  filename?: string;
  size?: number;
  url?: string;
  proxy_url?: string;
  content_type?: string;
}

export interface DiscordMessageReaction {
  emoji: { id: string | null; name: string | null };
  count: number;
}

export interface DiscordMessage {
  id: string;
  channel_id: string;
  guild_id?: string;
  content: string;
  timestamp?: string;
  edited_timestamp?: string | null;
  author?: DiscordMessageAuthor;
  attachments?: DiscordMessageAttachment[];
  embeds?: ReadonlyArray<Record<string, unknown>>;
  mentions?: ReadonlyArray<DiscordMessageAuthor>;
  mention_roles?: readonly string[];
  mention_everyone?: boolean;
  pinned?: boolean;
  reactions?: DiscordMessageReaction[];
  /** Discord message type — 0 = DEFAULT (a normal user/bot message). */
  type?: number;
  flags?: number;
  webhook_id?: string;
  tts?: boolean;
  nonce?: string | number;
  referenced_message?: DiscordMessage | null;
}

// ─── messageCreate ──────────────────────────────────────────────────────────

export interface MessageCreateInput {
  channelId: string;
  content?: string;
  /**
   * Optional embed array. Each embed is an object whose schema is
   * documented at Discord's `Embed` reference. We pass through verbatim
   * — the action handler builds the shape from its config.
   */
  embeds?: ReadonlyArray<Record<string, unknown>>;
}

export async function messageCreate(
  input: MessageCreateInput,
): Promise<DiscordMessage> {
  const body: Record<string, unknown> = {};
  if (input.content !== undefined) body.content = input.content;
  if (input.embeds !== undefined && input.embeds.length > 0) {
    body.embeds = [...input.embeds];
  }
  return discordBotRequest<DiscordMessage>({
    method: "POST",
    path: `/channels/${encodeURIComponent(input.channelId)}/messages`,
    body,
    resourceForNotFound: `channel ${input.channelId}`,
  });
}

// ─── messageEdit ────────────────────────────────────────────────────────────

export interface MessageEditInput {
  channelId: string;
  messageId: string;
  /** Required for V2's edit_message — the new full content. */
  content: string;
}

/**
 * PATCH a message. Discord enforces: only the message author (the bot)
 * can edit a message. Attempting to edit another author's message
 * returns 403 with code 50005 (Cannot edit a message authored by
 * another user). The wrapper surfaces this verbatim via
 * `DiscordApiError`; the action handler annotates with bot-specific
 * guidance.
 */
export async function messageEdit(
  input: MessageEditInput,
): Promise<DiscordMessage> {
  return discordBotRequest<DiscordMessage>({
    method: "PATCH",
    path: `/channels/${encodeURIComponent(input.channelId)}/messages/${encodeURIComponent(input.messageId)}`,
    body: { content: input.content },
    resourceForNotFound: `message ${input.messageId}`,
  });
}

// ─── messageDelete (single) ─────────────────────────────────────────────────

export interface MessageDeleteInput {
  channelId: string;
  messageId: string;
  auditLogReason?: string;
}

/**
 * DELETE a single message. Returns 204 on success (wrapper resolves
 * with null). Bot needs Manage Messages permission to delete messages
 * authored by other users; bot can always delete its own messages
 * regardless of the permission.
 */
export async function messageDelete(input: MessageDeleteInput): Promise<void> {
  await discordBotRequest<null>({
    method: "DELETE",
    path: `/channels/${encodeURIComponent(input.channelId)}/messages/${encodeURIComponent(input.messageId)}`,
    resourceForNotFound: `message ${input.messageId}`,
    auditLogReason: input.auditLogReason,
  });
}

// ─── messagesBulkDelete (2-100 in one call) ─────────────────────────────────

export interface MessagesBulkDeleteInput {
  channelId: string;
  /**
   * 2-100 message IDs. Discord-enforced bounds:
   *   - <2: Discord rejects with 400 ("must be between 2 and 100").
   *   - >100: Discord rejects with 400. Callers chunk.
   * All messages must be newer than 14 days; older messages → 400.
   * Callers must fall back to single `messageDelete` for older messages.
   */
  messageIds: readonly string[];
  auditLogReason?: string;
}

/**
 * POST bulk-delete. Returns 204 on success (wrapper resolves with null).
 *
 * V1 references:
 *   - `messages/bulk-delete` endpoint at lib/workflows/actions/discord.ts:1079
 *   - 14-day rule + min-2 enforcement at the same call site.
 */
export async function messagesBulkDelete(
  input: MessagesBulkDeleteInput,
): Promise<void> {
  await discordBotRequest<null>({
    method: "POST",
    path: `/channels/${encodeURIComponent(input.channelId)}/messages/bulk-delete`,
    body: { messages: [...input.messageIds] },
    resourceForNotFound: `channel ${input.channelId}`,
    auditLogReason: input.auditLogReason,
  });
}

// ─── messagesList (GET /channels/{id}/messages) ─────────────────────────────

export interface MessagesListInput {
  channelId: string;
  /** Discord caps at 100 per call. Default 50. */
  limit?: number;
  /** Optional cursor — only messages before this id. */
  before?: string;
  /** Optional cursor — only messages after this id. */
  after?: string;
  /** Optional cursor — messages around this id. */
  around?: string;
}

/**
 * GET messages. Discord returns newest-first by default. Callers that
 * want oldest-first reverse client-side.
 */
export async function messagesList(
  input: MessagesListInput,
): Promise<readonly DiscordMessage[]> {
  const query = new URLSearchParams();
  query.set("limit", String(Math.min(Math.max(input.limit ?? 50, 1), 100)));
  if (input.before) query.set("before", input.before);
  if (input.after) query.set("after", input.after);
  if (input.around) query.set("around", input.around);
  return discordBotRequest<DiscordMessage[]>({
    method: "GET",
    path: `/channels/${encodeURIComponent(input.channelId)}/messages`,
    query,
    resourceForNotFound: `channel ${input.channelId}`,
  });
}
