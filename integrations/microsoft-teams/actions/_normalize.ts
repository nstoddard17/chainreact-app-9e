import type { ChatMessageResource } from "../api/types";

/**
 * Normalizes a Graph `chatMessage` resource into the V2 downstream
 * variable shape shared by send_channel_message, reply_to_channel_message,
 * and send_chat_message.
 *
 * Stable across (provider, type) per the action-handler contract — any
 * change here breaks pinned variable references in user workflows.
 *
 * Caller adds membership context (`teamId`/`channelId` or `chatId`)
 * on top of this — those fields don't appear in the chatMessage
 * resource itself, only in the caller's resolved config.
 */
export function normalizeChatMessage(message: ChatMessageResource): {
  messageId: string;
  createdDateTime: string | null;
  lastModifiedDateTime: string | null;
  replyToId: string | null;
  subject: string | null;
  bodyContent: string;
  bodyContentType: string | null;
  fromUserId: string | null;
  fromUserDisplayName: string | null;
  webUrl: string | null;
} {
  return {
    messageId: message.id,
    createdDateTime: message.createdDateTime ?? null,
    lastModifiedDateTime: message.lastModifiedDateTime ?? null,
    replyToId: message.replyToId ?? null,
    subject: message.subject ?? null,
    bodyContent: message.body?.content ?? "",
    bodyContentType: message.body?.contentType ?? null,
    fromUserId: message.from?.user?.id ?? null,
    fromUserDisplayName: message.from?.user?.displayName ?? null,
    webUrl: message.webUrl ?? null,
  };
}
