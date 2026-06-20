import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `microsoft-teams:list_channel_messages` — Slice
 * 4.TEAMS-READ-2. Mirrors `listChannelMessages.schema.ts`. Read action (low
 * risk).
 *
 * `teamId` → teams resolver; `channelId` → channels resolver (dependsOn
 * teamId). Returns HEADER-LEVEL metadata only — body / subject / sender
 * display name / attachments are never surfaced (the handler projects an
 * explicit safe shape). `fromUserId` is the sender's opaque AAD object id
 * (not PII). Uses the already-granted `ChannelMessage.Read.All` scope.
 */
export const microsoftTeamsListChannelMessagesMeta: ActionMeta = {
  key: "microsoft-teams:list_channel_messages",
  provider: "microsoft-teams",
  type: "list_channel_messages",
  displayName: "List Channel Messages",
  description:
    "List a channel's recent messages as header-level metadata only (id, timestamps, importance, type, sender id, deeplink). One page (Top, 1–50, default 20). Read-only — message body, subject, attachments, and sender names are never returned.",
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
      description: "The channel to read messages from. Pick a team first.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-teams:channels",
      dependsOn: "teamId",
      placeholder: "Select a team first",
    },
    {
      name: "top",
      label: "Top",
      description: "Max messages to return in this single page (1–50). Defaults to 20.",
      type: "number",
      required: false,
      defaultValue: 20,
      numeric: { min: 1, max: 50, integer: true },
    },
  ],
  outputs: [
    { name: "teamId", type: "string", description: "The team id (echoed)." },
    { name: "channelId", type: "string", description: "The channel id (echoed)." },
    {
      name: "messages",
      type: "array",
      description:
        "Header-level message metadata — each `{ id, createdDateTime, lastModifiedDateTime, importance, messageType, fromUserId, webUrl }`. No body, subject, attachments, or sender name.",
    },
    { name: "count", type: "number", description: "Number of messages on this page." },
    { name: "hasMore", type: "boolean", description: "True when Graph has a further page of messages." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 80,
  riskLevel: "low",
  riskDescription: "Reads channel message metadata only — no body/content, no mutation.",
};
