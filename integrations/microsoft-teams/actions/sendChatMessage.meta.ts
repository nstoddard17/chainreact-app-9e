import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `microsoft-teams:send_chat_message` — Slice
 * 4.TEAMS-META-3. Mirrors `sendChatMessage.schema.ts`. Write action
 * (medium risk).
 *
 * `chatId` → `microsoft-teams:chats` combobox (RESOLVERS-1 — Marcus
 * approved un-deferring; unnamed chats are labeled by participant
 * display names via member expansion). Manual entry stays available for
 * pasted ids / variable wiring. `bodyContent` output → sensitive.
 */
export const microsoftTeamsSendChatMessageMeta: ActionMeta = {
  key: "microsoft-teams:send_chat_message",
  provider: "microsoft-teams",
  type: "send_chat_message",
  displayName: "Send Chat Message",
  description: "Post a message to a Microsoft Teams 1:1 or group chat.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "chatId",
      label: "Chat",
      description:
        "Pick the chat to post to — unnamed chats are listed by participant names. You can also paste a chat id or wire it from an earlier step.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-teams:chats",
      allowManualEntry: true,
      placeholder: "Search chats…",
    },
    {
      name: "content",
      label: "Message",
      description: "The message body. HTML or plain text per Content Type.",
      type: "textarea",
      required: true,
      placeholder: "Write a message…",
    },
    {
      name: "contentType",
      label: "Content Type",
      description: "How the message body is rendered.",
      type: "select",
      required: false,
      defaultValue: "html",
      options: [
        { value: "html", label: "HTML" },
        { value: "text", label: "Plain text" },
      ],
    },
  ],
  outputs: [
    { name: "messageId", type: "string", description: "The new message id." },
    { name: "createdDateTime", type: "string", description: "ISO-8601 created." },
    { name: "lastModifiedDateTime", type: "string", description: "ISO-8601 modified." },
    { name: "replyToId", type: "string", description: "Parent message id (or null)." },
    { name: "subject", type: "string", description: "Message subject (or null)." },
    {
      name: "bodyContent",
      type: "string",
      description: "The posted message body.",
      sensitive: true,
    },
    { name: "bodyContentType", type: "string", description: "html | text." },
    { name: "fromUserId", type: "string", description: "Sender's user id." },
    { name: "fromUserDisplayName", type: "string", description: "Sender's display name." },
    { name: "webUrl", type: "string", description: "Teams deeplink to the message." },
    { name: "chatId", type: "string", description: "The chat id." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 30,
  riskLevel: "medium",
  riskDescription: "Posts a chat message (recoverable — delete the message to undo).",
};
