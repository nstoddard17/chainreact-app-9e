import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `slack:reaction_added` (Slack 2.1).
 *
 * Webhook-activated trigger. The filter
 * (`integrations/slack/triggers/reactionAdded/filter.ts`) normalizes the
 * configured emoji name (strips surrounding colons, casefolds) before
 * comparing to the inbound event's `reaction` field — same helper used
 * by the `add_reaction` / `remove_reaction` actions. Workflow authors
 * may enter either `thumbsup` or `:thumbsup:` and the comparison
 * works either way.
 *
 * The optional `channelId` filter targets the reacted-to message's
 * channel — Slack's reaction events carry the channel at
 * `payload.item.channel`, not `payload.channel`.
 *
 * Required scope: `reactions:read` (manifest required set).
 *
 * Shared-infrastructure exempt — see SHARED_INFRA_EXEMPT_KEYS.
 */
export const reactionAddedTriggerMeta: TriggerMeta = {
  key: "slack:reaction_added",
  provider: "slack",
  type: "reaction_added",
  displayName: "Reaction Added",
  description:
    "Fires when a reaction (emoji) is added to a message. Optionally filter by emoji name and/or channel. Emoji names may be entered with or without surrounding colons. Requires the reactions:read scope.",
  category: "messaging",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "reactionEmoji",
      label: "Emoji (optional)",
      description:
        "Emoji name to match (e.g. 'thumbsup' or ':thumbsup:'). When blank, every reaction matches.",
      type: "text",
      required: false,
      placeholder: "thumbsup",
    },
    {
      name: "channelId",
      sensitivity: "recipient",
      label: "Channel ID (optional)",
      description:
        "When set, only reactions on messages in this public channel fire the workflow. Slack public channel ids start with 'C'.",
      type: "text",
      required: false,
      placeholder: "C0123456789",
    },
  ],
  payloadShape: [
    { name: "type", type: "string", description: "Slack event type — 'reaction_added'." },
    { name: "user", type: "string", description: "User id of the person who added the reaction." },
    { name: "reaction", type: "string", description: "Emoji name without surrounding colons (e.g. 'thumbsup')." },
    { name: "item_user", type: "string", description: "User id of the original message author." },
    { name: "item", type: "object", description: "Reacted-to item — { type: 'message', channel, ts }." },
    { name: "event_ts", type: "string", description: "Slack event timestamp." },
  ],
  displayOrder: 50,
};
