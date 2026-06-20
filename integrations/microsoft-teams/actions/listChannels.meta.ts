import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `microsoft-teams:list_channels` — Slice 4.TEAMS-READ-2.
 * Mirrors `listChannels.schema.ts`. Read action (low risk).
 *
 * `teamId` → `microsoft-teams:teams` resolver. Returns bounded channel
 * metadata (id/displayName/description/membershipType); the channel `email`
 * is never fetched (wrapper `$select` omits it). No message content. Uses the
 * already-granted `Channel.ReadBasic.All` scope.
 */
export const microsoftTeamsListChannelsMeta: ActionMeta = {
  key: "microsoft-teams:list_channels",
  provider: "microsoft-teams",
  type: "list_channels",
  displayName: "List Channels",
  description:
    "List the channels of a Microsoft Teams team (id, display name, description, membership type). Read-only — one page; no message content.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "teamId",
      label: "Team",
      description: "The team whose channels to list.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-teams:teams",
      placeholder: "Search teams…",
    },
  ],
  outputs: [
    { name: "teamId", type: "string", description: "The team id (echoed)." },
    {
      name: "channels",
      type: "array",
      description:
        "Channels — each `{ id, displayName, description, membershipType }` (description may be null).",
    },
    { name: "count", type: "number", description: "Number of channels on this page." },
    { name: "hasMore", type: "boolean", description: "True when Graph has a further page of channels." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 70,
  riskLevel: "low",
  riskDescription: "Reads the channel list — no provider-side mutation, no message content.",
};
