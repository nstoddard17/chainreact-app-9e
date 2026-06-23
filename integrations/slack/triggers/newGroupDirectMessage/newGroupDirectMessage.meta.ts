import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `slack:message.mpim` (Slack 2.1).
 *
 * Webhook-activated trigger backed by Slack's Events API. `mpim` =
 * multi-party DM (a group chat between 3+ users including the bot).
 *
 * The optional `channelId` filter targets a specific group-DM channel.
 * Group DMs use the historical Slack 'G' prefix. Per the Slack 2.2
 * normalizer tightening, public/private/group-DM disambiguation happens
 * via `channel_type` (authoritative), not id prefix.
 *
 * Required scope: `mpim:history` (manifest required set).
 *
 * Shared-infrastructure exempt — see SHARED_INFRA_EXEMPT_KEYS.
 */
export const newGroupDirectMessageTriggerMeta: TriggerMeta = {
  key: "slack:message.mpim",
  provider: "slack",
  type: "message.mpim",
  displayName: "New Group Direct Message",
  description:
    "Fires when a message is posted to a multi-party DM (group chat) the bot is part of. Optionally filter to a single group-DM channel by id. Requires the mpim:history scope.",
  category: "messaging",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "channelId",
      sensitivity: "recipient",
      label: "Channel ID (optional)",
      description:
        "When set, only messages in this group-DM channel fire the workflow. Pick from your group DMs, or paste a channel id. When blank, every group-DM message the bot can see matches. Slack group-DM ids start with 'G'.",
      type: "combobox",
      optionsSource: "slack:group_dms",
      allowManualEntry: true,
      required: false,
      placeholder: "Search group DMs or paste a 'G…' id",
    },
  ],
  payloadShape: [
    { name: "type", type: "string", description: "Slack event type — 'message'." },
    { name: "subtype", type: "string", description: "Optional Slack subtype." },
    { name: "channel", type: "string", description: "Group-DM channel id ('G…')." },
    { name: "channel_type", type: "string", description: "Channel kind — 'mpim' for multi-party DMs." },
    { name: "user", type: "string", description: "Sender user id." },
    { name: "text", type: "string", description: "Message text.", sensitive: true  },
    { name: "ts", type: "string", description: "Slack message timestamp." },
    { name: "thread_ts", type: "string", description: "Parent thread timestamp when this message is a thread reply." },
    { name: "team", type: "string", description: "Slack workspace (team) id." },
    { name: "event_ts", type: "string", description: "Slack event timestamp." },
    { name: "blocks", type: "array", description: "Slack Block Kit blocks attached to the message." },
  ],
  displayOrder: 40,
};
