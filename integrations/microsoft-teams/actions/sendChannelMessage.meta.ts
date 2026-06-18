import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `microsoft-teams:send_channel_message` — Slice
 * 4.TEAMS-META-3. Mirrors `sendChannelMessage.schema.ts`. Write action
 * (medium risk — recoverable; Teams messages are deletable).
 *
 * Picker cascade: `teamId` (microsoft-teams:teams) → `channelId`
 * (microsoft-teams:channels, dependsOn teamId). Both are real schema
 * fields — no UI-scope addition. `bodyContent` output is the posted
 * message text → sensitive.
 */
export const microsoftTeamsSendChannelMessageMeta: ActionMeta = {
  key: "microsoft-teams:send_channel_message",
  provider: "microsoft-teams",
  type: "send_channel_message",
  displayName: "Send Channel Message",
  description: "Post a new message to a Microsoft Teams channel.",
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
      description: "The channel to post in. Pick a team first.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-teams:channels",
      dependsOn: "teamId",
      sensitivity: "recipient",
      placeholder: "Select a team first",
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
    { name: "replyToId", type: "string", description: "Parent message id (null for top-level)." },
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
    { name: "teamId", type: "string", description: "The team id." },
    { name: "channelId", type: "string", description: "The channel id." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 10,
  riskLevel: "medium",
  riskDescription: "Posts a channel message (recoverable — delete the message to undo).",
};
