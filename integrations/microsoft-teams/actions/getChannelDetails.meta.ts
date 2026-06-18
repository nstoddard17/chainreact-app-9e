import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `microsoft-teams:get_channel_details` — Slice
 * 4.TEAMS-META-3. Mirrors `getChannelDetails.schema.ts`. Read action
 * (low risk).
 *
 * Picker cascade: `teamId` → `channelId` (dependsOn teamId). The channel
 * `email` output (the channel's posting address) → sensitive.
 */
export const microsoftTeamsGetChannelDetailsMeta: ActionMeta = {
  key: "microsoft-teams:get_channel_details",
  provider: "microsoft-teams",
  type: "get_channel_details",
  displayName: "Get Channel Details",
  description: "Get metadata for a Microsoft Teams channel.",
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
      sensitivity: "recipient",
      label: "Channel",
      description: "The channel to read. Pick a team first.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-teams:channels",
      dependsOn: "teamId",
      placeholder: "Select a team first",
    },
  ],
  outputs: [
    { name: "teamId", type: "string", description: "The team id." },
    { name: "channelId", type: "string", description: "The channel id." },
    { name: "displayName", type: "string", description: "Channel display name." },
    { name: "description", type: "string", description: "Channel description (or null)." },
    {
      name: "email",
      type: "string",
      description: "The channel's email address (or null).",
      sensitive: true,
    },
    { name: "membershipType", type: "string", description: "standard | private | …" },
    { name: "createdDateTime", type: "string", description: "ISO-8601 created." },
    { name: "webUrl", type: "string", description: "Teams deeplink to the channel." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 40,
  riskLevel: "low",
  riskDescription: "Reads channel metadata — no provider-side mutation.",
};
