/**
 * Microsoft Graph Teams resource types.
 *
 * Only the fields V2 wrappers + handlers actually consume — kept narrow
 * on purpose. Graph returns many more, but pinning a small surface
 * keeps the contract obvious and tests cheap.
 *
 * Endpoint families:
 *   - `/v1.0/teams/{teamId}/channels/{channelId}/messages` (channel
 *     messages — both send + reply).
 *   - `/v1.0/teams/{teamId}/channels/{channelId}` (channel metadata).
 *   - `/v1.0/teams/{teamId}/members` (team membership read).
 *   - `/v1.0/chats/{chatId}/messages` (chat messages).
 *
 * Slice 16: shapes mirror V1's inline use in
 * `lib/workflows/actions/teams/*.ts`. The chatMessage shape is shared
 * between channel + chat write paths; Graph's response envelope is
 * identical for both.
 */

/**
 * Graph `chatMessage` body block.
 *
 * `contentType` is the wire-level flag controlling whether Graph
 * renders `content` as HTML or escapes it as plain text. V1 hardcoded
 * `'html'` on two handlers and omitted it (Graph default = text) on
 * the reply handler — V2 normalizes by accepting `'text' | 'html'`
 * and defaulting to `'html'` in every write path (documented choice;
 * matches V1's two sends + the Teams UI default).
 */
export type ExcelChatMessageContentType = "text" | "html";

export interface ChatMessageBody {
  contentType: ExcelChatMessageContentType;
  content: string;
}

/**
 * Graph `chatMessage` resource — the response shape returned by every
 * channel-message-send / channel-message-reply / chat-message-send call.
 *
 * V2 surfaces a narrow downstream output: id, createdDateTime, webUrl
 * when present, plus a `from.user` pluck for downstream variable refs.
 */
export interface ChatMessageResource {
  id: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  /**
   * Conversation thread id. For channel messages, equal to the
   * top-level message id (replies share the same `replyToId` →
   * parent's id). For reply messages, `id` is the reply's own id and
   * `replyToId` points at the parent.
   */
  replyToId?: string | null;
  /**
   * Subject (channel messages only — chats don't carry a subject).
   */
  subject?: string | null;
  body?: ChatMessageBody;
  from?: {
    user?: {
      id?: string;
      displayName?: string;
      userIdentityType?: string;
    } | null;
    application?: unknown;
  } | null;
  /** Web URL into the Teams UI for the message. */
  webUrl?: string;
}

/**
 * Graph `channel` resource — metadata only. Used by `get_channel_details`.
 *
 * `membershipType` is `'standard' | 'private' | 'unknownFutureValue'`.
 */
export interface TeamsChannelResource {
  id: string;
  displayName?: string;
  description?: string | null;
  email?: string | null;
  membershipType?: string;
  createdDateTime?: string;
  webUrl?: string | null;
}

/**
 * Graph `conversationMember` resource (aadUserConversationMember sub-type
 * is the common case for `/teams/{id}/members`).
 *
 * V2 surfaces `id` (the conversationMember id; NOT the AAD object id),
 * `displayName`, `email`, `userId` (the AAD object id), and `roles`
 * (`['owner']` | `[]`).
 */
export interface TeamsConversationMember {
  id: string;
  displayName?: string;
  email?: string | null;
  userId?: string;
  roles?: readonly string[];
}
