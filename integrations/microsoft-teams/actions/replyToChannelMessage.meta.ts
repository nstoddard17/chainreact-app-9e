import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `microsoft-teams:reply_to_channel_message` — Slice
 * 4.TEAMS-META-3. Mirrors `replyToChannelMessage.schema.ts`. Write action
 * (medium risk).
 *
 * Picker cascade: `teamId` → `channelId` (dependsOn teamId). `messageId`
 * (the parent message) stays a **typeable text field** — it commonly flows
 * from the `new_channel_message` trigger (`{{trigger.messageId}}`); a
 * channel-message picker (`microsoft-teams:messages`) is deferred (expensive
 * + ordering-ambiguous). `bodyContent` output → sensitive.
 */
export const microsoftTeamsReplyToChannelMessageMeta: ActionMeta = {
  key: "microsoft-teams:reply_to_channel_message",
  provider: "microsoft-teams",
  type: "reply_to_channel_message",
  displayName: "Reply to Channel Message",
  description: "Post a reply to an existing message in a Microsoft Teams channel.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "teamId",
      label: "Team",
      description: "The team that owns the channel.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-teams:teams",
      placeholder: "Search teams…",
    },
    {
      name: "channelId",
      label: "Channel",
      description: "The channel containing the message. Pick a team first.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-teams:channels",
      dependsOn: "teamId",
      placeholder: "Select a team first",
    },
    {
      name: "messageId",
      label: "Parent Message ID",
      description:
        "The message to reply to — usually from the New Channel Message trigger (e.g. {{trigger.messageId}}).",
      type: "text",
      required: true,
      placeholder: "Parent message id",
    },
    {
      name: "content",
      label: "Reply",
      description: "The reply body. HTML or plain text per Content Type.",
      type: "textarea",
      required: true,
      placeholder: "Write a reply…",
    },
    {
      name: "contentType",
      label: "Content Type",
      description: "How the reply body is rendered.",
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
    { name: "messageId", type: "string", description: "The new reply's message id." },
    { name: "createdDateTime", type: "string", description: "ISO-8601 created." },
    { name: "lastModifiedDateTime", type: "string", description: "ISO-8601 modified." },
    { name: "replyToId", type: "string", description: "The parent message id." },
    { name: "subject", type: "string", description: "Message subject (or null)." },
    {
      name: "bodyContent",
      type: "string",
      description: "The posted reply body.",
      sensitive: true,
    },
    { name: "bodyContentType", type: "string", description: "html | text." },
    { name: "fromUserId", type: "string", description: "Sender's user id." },
    { name: "fromUserDisplayName", type: "string", description: "Sender's display name." },
    { name: "webUrl", type: "string", description: "Teams deeplink to the reply." },
    { name: "teamId", type: "string", description: "The team id." },
    { name: "channelId", type: "string", description: "The channel id." },
    { name: "parentMessageId", type: "string", description: "The replied-to message id." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 20,
  riskLevel: "medium",
  riskDescription: "Posts a reply (recoverable — delete the reply to undo).",
};
