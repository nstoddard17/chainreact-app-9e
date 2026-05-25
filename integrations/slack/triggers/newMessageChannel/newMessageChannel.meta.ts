import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `slack:message.channel` (Slack 2.1).
 *
 * Webhook-activated trigger backed by Slack's Events API. Slack uses a
 * single global webhook URL per app installation — there is no
 * per-workflow subscription to create at activate time. The lifecycle
 * service writes a `trigger_resources` row and the filter at
 * `integrations/slack/triggers/newMessageChannel/filter.ts` (eventType
 * `slack.message.channel`) gates inbound events against the row's
 * config. Because there is no per-workflow activation work, this trigger
 * is exempt from the activation-registry invariant test
 * (`SHARED_INFRA_EXEMPT_KEYS` in
 * `tests/structure/trigger-meta-activation-invariant.test.ts`).
 *
 * `type === "message.channel"` matches the canonical Slack event type
 * `slack.message.channel` after the provider prefix is stripped, which
 * is what `lifecycle.ts` stores in `trigger_resources.event_type` and
 * what the dispatcher queries on lookup.
 *
 * Required scope (`channels:history`) is granted by the Slack manifest's
 * `required` set — surfaced in the description so a workflow author who
 * disconnects + reconnects with a downgraded scope set sees why the
 * trigger may stop firing. The trigger config UI deliberately does not
 * gate on scope status (out of scope for Slice 3.11).
 *
 * `payloadShape` mirrors the raw Slack inner `event` object that
 * `integrations/slack/webhooks/normalize.ts` passes through verbatim as
 * the canonical `TriggerEvent.payload`.
 */
export const newMessageChannelTriggerMeta: TriggerMeta = {
  key: "slack:message.channel",
  provider: "slack",
  type: "message.channel",
  displayName: "New Message in Channel",
  description:
    "Fires when a message is posted to a public Slack channel. Optionally filter to a single channel by id. Requires the channels:history scope.",
  category: "messaging",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "channelId",
      label: "Channel ID (optional)",
      description:
        "When set, only messages in this public channel fire the workflow. When blank, fires for every public-channel message in the workspace. Slack public channel ids start with 'C'.",
      type: "text",
      required: false,
      placeholder: "C0123456789",
    },
  ],
  payloadShape: [
    { name: "type", type: "string", description: "Slack event type — 'message'." },
    { name: "subtype", type: "string", description: "Optional Slack subtype (e.g. 'bot_message', 'message_changed')." },
    { name: "channel", type: "string", description: "Channel id where the message was posted." },
    { name: "channel_type", type: "string", description: "Channel kind — 'channel' for public channels." },
    { name: "user", type: "string", description: "Sender user id. Absent for bot_message subtype; see bot_id." },
    { name: "bot_id", type: "string", description: "Sender bot id when the message is from a bot." },
    { name: "text", type: "string", description: "Message text.", sensitive: true  },
    { name: "ts", type: "string", description: "Slack message timestamp — uniquely identifies the message within the channel." },
    { name: "thread_ts", type: "string", description: "Parent thread timestamp when this message is a thread reply." },
    { name: "team", type: "string", description: "Slack workspace (team) id." },
    { name: "event_ts", type: "string", description: "Slack event timestamp." },
    { name: "blocks", type: "array", description: "Slack Block Kit blocks attached to the message." },
  ],
  displayOrder: 10,
};
