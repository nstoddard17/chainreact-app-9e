import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `slack:member_left_channel` (Slack 2.2).
 *
 * Webhook-activated trigger. Slack delivers one event per (user,
 * channel) departure — voluntary `leave` actions and kicks via
 * `conversations.kick` both surface here.
 *
 * `channelId` filter accepts public ('C…') and private (modern 'C…',
 * legacy 'G…') channel ids. DMs and group DMs do NOT fire this event.
 *
 * Required scopes: `channels:read` (public) + `groups:read` (private).
 *
 * Shared-infrastructure exempt — see SHARED_INFRA_EXEMPT_KEYS.
 */
export const memberLeftChannelTriggerMeta: TriggerMeta = {
  key: "slack:member_left_channel",
  provider: "slack",
  type: "member_left_channel",
  displayName: "Member Left Channel",
  description:
    "Fires when a user leaves a Slack channel (public or private) — voluntary leaves and kicks both surface here. Optionally filter to a single channel by id. Requires the channels:read and groups:read scopes.",
  category: "messaging",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "channelId",
      sensitivity: "recipient",
      label: "Channel (optional)",
      description:
        "When set, only departures from this channel fire the workflow. When blank, every member-left event matches.",
      type: "combobox",
      optionsSource: "slack:channels",
      allowManualEntry: true,
      required: false,
      placeholder: "Search channels or paste a channel ID",
    },
  ],
  payloadShape: [
    { name: "type", type: "string", description: "Slack event type — 'member_left_channel'." },
    { name: "user", type: "string", description: "User id of the person who left." },
    { name: "channel", type: "string", description: "Channel id." },
    { name: "channel_type", type: "string", description: "Channel id-prefix tag ('C' or 'G')." },
    { name: "team", type: "string", description: "Slack workspace (team) id." },
    { name: "event_ts", type: "string", description: "Slack event timestamp." },
  ],
  displayOrder: 90,
};
