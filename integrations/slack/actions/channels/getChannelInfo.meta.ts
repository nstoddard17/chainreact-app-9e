import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:get_channel_info`.
 *
 * Mirrors `getChannelInfo.schema.ts`:
 *   - `channel` (required) — combobox sourced from `slack:channels`.
 *                            Schema accepts `^[CDG][A-Z0-9]+$`.
 *
 * Required scopes: `channels:read` + `groups:read`.
 *
 * Outputs mirror `getChannelInfo.ts:return` — full Slack channel
 * object plus salient bounded scalars (id, name, is_private,
 * is_archived, num_members, topic, purpose, created).
 */
export const slackGetChannelInfoMeta: ActionMeta = {
  key: "slack:get_channel_info",
  provider: "slack",
  type: "get_channel_info",
  displayName: "Get Channel Info",
  description:
    "Read a Slack channel's info object by id via conversations.info. Returns the full Slack channel record plus bounded scalars for direct variable wiring.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "channel",
      label: "Channel",
      description:
        "Searchable picker over public + private channels visible to the bot. The saved value is the underlying channel id (C…/G…/D…).",
      type: "combobox",
      optionsSource: "slack:channels",
      required: true,
      placeholder: "Search channels…",
    },
  ],
  outputs: [
    {
      name: "channel",
      type: "object",
      description:
        "Full Slack channel record as returned by conversations.info. Drill into specific fields via the variable picker.",
    },
    {
      name: "id",
      type: "string",
      description: "Slack channel id (C…/D…/G…).",
    },
    {
      name: "name",
      type: "string",
      description: "Channel name without the leading hash (e.g. `general`).",
    },
    {
      name: "is_private",
      type: "boolean",
      description: "True for private channels (G… legacy or C… modern private).",
    },
    {
      name: "is_archived",
      type: "boolean",
      description: "True when the channel is archived.",
    },
    {
      name: "num_members",
      type: "number",
      description: "Slack's count of members in the channel.",
    },
    {
      name: "topic",
      type: "string",
      description: "Current channel topic (may be empty).",
    },
    {
      name: "purpose",
      type: "string",
      description: "Current channel purpose (may be empty).",
    },
    {
      name: "created",
      type: "number",
      description: "Channel creation time as a Unix-seconds integer.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 170,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
