import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `slack:reaction_removed` (Slack 2.1).
 *
 * Mirror of `slack:reaction_added` — same fields, same payload shape,
 * same emoji-normalization semantics. See reactionAdded.meta.ts for
 * the contract details.
 *
 * Required scope: `reactions:read`.
 *
 * Shared-infrastructure exempt — see SHARED_INFRA_EXEMPT_KEYS.
 */
export const reactionRemovedTriggerMeta: TriggerMeta = {
  key: "slack:reaction_removed",
  provider: "slack",
  type: "reaction_removed",
  displayName: "Reaction Removed",
  description:
    "Fires when a reaction (emoji) is removed from a message. Optionally filter by emoji name and/or channel. Emoji names may be entered with or without surrounding colons. Requires the reactions:read scope.",
  category: "messaging",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "reactionEmoji",
      label: "Emoji (optional)",
      description:
        "Emoji name to match (e.g. 'thumbsup' or ':thumbsup:'). When blank, every reaction-removed event matches.",
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
    { name: "type", type: "string", description: "Slack event type — 'reaction_removed'." },
    { name: "user", type: "string", description: "User id of the person who removed the reaction." },
    { name: "reaction", type: "string", description: "Emoji name without surrounding colons (e.g. 'thumbsup')." },
    { name: "item_user", type: "string", description: "User id of the original message author." },
    { name: "item", type: "object", description: "Reacted-to item — { type: 'message', channel, ts }." },
    { name: "event_ts", type: "string", description: "Slack event timestamp." },
  ],
  displayOrder: 60,
};
