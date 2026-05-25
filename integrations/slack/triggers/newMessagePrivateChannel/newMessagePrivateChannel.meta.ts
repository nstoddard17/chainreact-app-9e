import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `slack:message.group` (Slack 2.2).
 *
 * Webhook-activated trigger. Slack uses `channel_type === "group"` for
 * private-channel messages — its own taxonomy term — and the normalizer
 * treats `channel_type` as authoritative. The G-prefix id fallback was
 * intentionally removed in Slack 2.2 because legacy private channels
 * share that prefix with group DMs and the two cannot be disambiguated
 * from the id alone. See `integrations/slack/webhooks/normalize.ts` and
 * the Slack 2.2 deep-gotcha entry in CLAUDE.md.
 *
 * Required scope: `groups:history`. Without it Slack will not deliver
 * `message` events for private channels — the trigger will silently
 * never fire. The manifest's required set includes it.
 *
 * Shared-infrastructure exempt — see SHARED_INFRA_EXEMPT_KEYS.
 */
export const newMessagePrivateChannelTriggerMeta: TriggerMeta = {
  key: "slack:message.group",
  provider: "slack",
  type: "message.group",
  displayName: "New Message in Private Channel",
  description:
    "Fires when a message is posted to a private Slack channel the bot belongs to. Optionally filter to a single channel by id. Requires the groups:history scope.",
  category: "messaging",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "channelId",
      label: "Channel ID (optional)",
      description:
        "When set, only messages in this private channel fire the workflow. When blank, fires for every private-channel message the bot can see. Modern private channels use 'C' ids; legacy private channels use 'G' ids — both are accepted.",
      type: "text",
      required: false,
      placeholder: "C0123456789",
    },
  ],
  payloadShape: [
    { name: "type", type: "string", description: "Slack event type — 'message'." },
    { name: "subtype", type: "string", description: "Optional Slack subtype." },
    { name: "channel", type: "string", description: "Private channel id (modern 'C…' or legacy 'G…')." },
    { name: "channel_type", type: "string", description: "Channel kind — 'group' for private channels." },
    { name: "user", type: "string", description: "Sender user id." },
    { name: "bot_id", type: "string", description: "Sender bot id when the message is from a bot." },
    { name: "text", type: "string", description: "Message text.", sensitive: true  },
    { name: "ts", type: "string", description: "Slack message timestamp." },
    { name: "thread_ts", type: "string", description: "Parent thread timestamp when this message is a thread reply." },
    { name: "team", type: "string", description: "Slack workspace (team) id." },
    { name: "event_ts", type: "string", description: "Slack event timestamp." },
    { name: "blocks", type: "array", description: "Slack Block Kit blocks attached to the message." },
  ],
  displayOrder: 30,
};
