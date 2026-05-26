import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `microsoft-teams:send_chat_message` — Slice
 * 4.TEAMS-META-3. Mirrors `sendChatMessage.schema.ts`. Write action
 * (medium risk).
 *
 * `chatId` stays a **typeable text field** — a `microsoft-teams:chats`
 * resolver is deferred (Marcus decision: 1:1 chats are unnamed, labeling
 * needs participant expansion). Help text points at where to obtain a
 * chatId. `bodyContent` output → sensitive.
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
      label: "Chat ID",
      description:
        "The target chat's id. Obtain it from Teams (chat deep-link), Microsoft Graph, or admin tooling — a chat picker may be added later. You can also wire it from an upstream step.",
      type: "text",
      required: true,
      placeholder: "19:...@thread.v2",
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
