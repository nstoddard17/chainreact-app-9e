import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `slack:member_joined_channel` (Slack 2.2).
 *
 * Webhook-activated trigger. Slack delivers one event per (user,
 * channel) join — including the bot's own joins. Workflow authors that
 * want to ignore the bot's self-joins should add a downstream guard on
 * `payload.user`.
 *
 * `channelId` filter accepts both public ('C…') and private (modern
 * 'C…', legacy 'G…') channel ids — member-joined events fire for both
 * channel kinds. DMs and group DMs do NOT fire this event.
 *
 * Required scopes: `channels:read` (public) + `groups:read` (private).
 * Both are in the manifest's required set.
 *
 * Shared-infrastructure exempt — see SHARED_INFRA_EXEMPT_KEYS.
 */
export const memberJoinedChannelTriggerMeta: TriggerMeta = {
  key: "slack:member_joined_channel",
  provider: "slack",
  type: "member_joined_channel",
  displayName: "Member Joined Channel",
  description:
    "Fires when a user joins a Slack channel (public or private). Includes the bot's own joins — add a downstream guard on the user payload field to ignore them. Optionally filter to a single channel by id. Requires the channels:read and groups:read scopes.",
  category: "messaging",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "channelId",
      sensitivity: "recipient",
      label: "Channel (optional)",
      description:
        "When set, only joins to this channel fire the workflow. When blank, every member-joined event matches. Public and private channels are both supported.",
      type: "combobox",
      optionsSource: "slack:channels",
      allowManualEntry: true,
      required: false,
      placeholder: "Search channels or paste a channel ID",
    },
  ],
  payloadShape: [
    { name: "type", type: "string", description: "Slack event type — 'member_joined_channel'." },
    { name: "user", type: "string", description: "User id of the person who joined." },
    { name: "channel", type: "string", description: "Channel id." },
    { name: "channel_type", type: "string", description: "Channel id-prefix tag ('C' or 'G')." },
    { name: "team", type: "string", description: "Slack workspace (team) id." },
    { name: "inviter", type: "string", description: "User id of the inviter when the user was invited (absent for self-joins)." },
    { name: "event_ts", type: "string", description: "Slack event timestamp." },
  ],
  displayOrder: 80,
};
