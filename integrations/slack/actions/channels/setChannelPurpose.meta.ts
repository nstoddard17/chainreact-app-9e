import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:set_channel_purpose`.
 *
 * Mirrors `setChannelPurpose.schema.ts`:
 *   - `channel` (required) — combobox sourced.
 *   - `purpose` (required text, max 250) — empty string allowed
 *                                          (clears the purpose).
 *
 * Same shape as `set_channel_topic`; Slack treats topic + purpose as
 * separate metadata slots.
 *
 * Required scope: `channels:manage` (or `groups:write`).
 *
 * Outputs mirror `setChannelPurpose.ts:return` — `{channel, purpose}`.
 */
export const slackSetChannelPurposeMeta: ActionMeta = {
  key: "slack:set_channel_purpose",
  provider: "slack",
  type: "set_channel_purpose",
  displayName: "Set Channel Purpose",
  description:
    "Set a Slack channel's purpose (max 250 characters) via conversations.setPurpose. Pass an empty string to clear the purpose.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "channel",
      label: "Channel",
      description:
        "Searchable picker over public + private channels visible to the bot. The saved value is the underlying channel id (C…/G…).",
      type: "combobox",
      optionsSource: "slack:channels",
      required: true,
      placeholder: "Search channels…",
    },
    {
      name: "purpose",
      label: "Purpose",
      description:
        "New channel purpose. Max 250 characters; empty string clears the purpose.",
      type: "textarea",
      required: true,
      placeholder: "Coordination for the Q4 deals pipeline.",
    },
  ],
  outputs: [
    {
      name: "channel",
      type: "string",
      description: "Slack channel id (echoed from input).",
    },
    {
      name: "purpose",
      type: "string",
      description: "Resolved purpose value as Slack stored it.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 270,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Changes the channel purpose — visible to all members.",
};
