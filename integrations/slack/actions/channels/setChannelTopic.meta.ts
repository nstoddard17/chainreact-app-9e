import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:set_channel_topic`.
 *
 * Mirrors `setChannelTopic.schema.ts`:
 *   - `channel` (required) — combobox sourced.
 *   - `topic`   (required text, max 250) — empty string is allowed
 *                                          (clears the topic).
 *
 * `topic` renders as a textarea — Slack permits multi-line content up
 * to 250 chars.
 *
 * Required scope: `channels:manage` (or `groups:write`).
 *
 * Outputs mirror `setChannelTopic.ts:return` — `{channel, topic}`.
 */
export const slackSetChannelTopicMeta: ActionMeta = {
  key: "slack:set_channel_topic",
  provider: "slack",
  type: "set_channel_topic",
  displayName: "Set Channel Topic",
  description:
    "Set a Slack channel's topic (max 250 characters) via conversations.setTopic. Pass an empty string to clear the topic.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "channel",
      sensitivity: "recipient",
      label: "Channel",
      description:
        "Searchable picker over public + private channels visible to the bot. The saved value is the underlying channel id (C…/G…).",
      type: "combobox",
      optionsSource: "slack:channels",
      allowManualEntry: true,
      required: true,
      placeholder: "Search channels or paste a channel ID",
    },
    {
      name: "topic",
      label: "Topic",
      description:
        "New channel topic. Max 250 characters; empty string clears the topic.",
      type: "textarea",
      required: true,
      placeholder: "Weekly deal review — Tuesdays 10am",
    },
  ],
  outputs: [
    {
      name: "channel",
      type: "string",
      description: "Slack channel id (echoed from input).",
    },
    {
      name: "topic",
      type: "string",
      description: "Resolved topic value as Slack stored it.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 260,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Changes the channel topic — visible to all members.",
};
