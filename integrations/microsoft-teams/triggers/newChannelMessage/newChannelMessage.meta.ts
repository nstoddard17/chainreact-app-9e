import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder metadata for `microsoft-teams:new_channel_message` — Slice
 * 4.TEAMS-META-3.
 *
 * Per-(team, channel) Microsoft Graph webhook (subscription on
 * `/teams/{teamId}/channels/{channelId}/messages`, `changeType:"created"`,
 * renewed before its ~70.5h expiry). Activation is registered in
 * `triggers/newChannelMessage/index.ts` via
 * `registerActivation("microsoft-teams","new_channel_message",…)` (loaded by
 * `integrations/_registry.ts`), so the trigger-meta-activation-invariant
 * passes with no exemption.
 *
 * Config fields mirror the runtime `activate` reads: `teamId` +
 * `channelId` (both required — they anchor the subscription). `channelId`
 * cascades off the real `teamId` field (no UI-scope addition).
 *
 * Payload `bodyContent` (message text) + `bodyPreview` (content preview) →
 * sensitive; ids / names / `webUrl` / `subject` / dates / `importance` /
 * `messageType` / `changeType` are structural.
 */
export const microsoftTeamsNewChannelMessageTriggerMeta: TriggerMeta = {
  key: "microsoft-teams:new_channel_message",
  provider: "microsoft-teams",
  type: "new_channel_message",
  displayName: "New Channel Message",
  description:
    "Fires when a new message is posted to the selected Microsoft Teams channel.",
  category: "messaging",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "teamId",
      label: "Team",
      description: "The team that owns the channel to watch.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-teams:teams",
      placeholder: "Search teams…",
    },
    {
      name: "channelId",
      sensitivity: "recipient",
      label: "Channel",
      description: "The channel to watch for new messages. Pick a team first.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-teams:channels",
      dependsOn: "teamId",
      placeholder: "Select a team first",
    },
  ],
  payloadShape: [
    { name: "messageId", type: "string", description: "The new message id." },
    { name: "teamId", type: "string", description: "The team id." },
    { name: "channelId", type: "string", description: "The channel id." },
    { name: "subject", type: "string", description: "Message subject (or null)." },
    {
      name: "bodyContent",
      type: "string",
      description: "The message body.",
      sensitive: true,
    },
    { name: "bodyContentType", type: "string", description: "html | text (or null)." },
    {
      name: "bodyPreview",
      type: "string",
      description: "Plain-text message preview (or null).",
      sensitive: true,
    },
    { name: "importance", type: "string", description: "normal | high | urgent (or null)." },
    { name: "messageType", type: "string", description: "message | chatEvent | … (or null)." },
    { name: "replyToId", type: "string", description: "Parent message id (or null)." },
    { name: "fromUserId", type: "string", description: "Sender's user id (or null)." },
    {
      name: "fromUserDisplayName",
      type: "string",
      description: "Sender's display name (or null).",
    },
    { name: "createdDateTime", type: "string", description: "ISO-8601 created (or null)." },
    {
      name: "lastModifiedDateTime",
      type: "string",
      description: "ISO-8601 modified (or null).",
    },
    { name: "webUrl", type: "string", description: "Teams deeplink to the message (or null)." },
    { name: "changeType", type: "string", description: 'Graph change type ("created").' },
  ],
  displayOrder: 10,
};
