import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `slack:message.im` (Slack 2.1).
 *
 * Webhook-activated trigger. Same Slack-shared-infrastructure pattern as
 * the other Slack triggers — exempt from the activation-registry
 * invariant via `SHARED_INFRA_EXEMPT_KEYS` because Slack uses a single
 * global webhook URL.
 *
 * Filter contract note: the optional `withUserId` filter narrows by
 * SENDER, not by DM channel. Slack opens a DM channel between the bot's
 * authed user and any sender; the relevant identity for filtering is
 * therefore the message's `user` (sender), not `channel`.
 *
 * Required scope: `im:history` (manifest required set).
 */
export const newDirectMessageTriggerMeta: TriggerMeta = {
  key: "slack:message.im",
  provider: "slack",
  type: "message.im",
  displayName: "New Direct Message",
  description:
    "Fires when a direct message is sent to the bot's authed user. Optionally filter by sender user id. Requires the im:history scope.",
  category: "messaging",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "withUserId",
      label: "Sender User ID (optional)",
      description:
        "When set, only DMs whose sender matches this user id fire the workflow. When blank, every incoming DM matches. Slack user ids start with 'U'.",
      type: "text",
      required: false,
      placeholder: "U0123456789",
    },
  ],
  payloadShape: [
    { name: "type", type: "string", description: "Slack event type — 'message'." },
    { name: "subtype", type: "string", description: "Optional Slack subtype." },
    { name: "channel", type: "string", description: "DM channel id (Slack 'D…' prefix)." },
    { name: "channel_type", type: "string", description: "Channel kind — 'im' for direct messages." },
    { name: "user", type: "string", description: "Sender user id." },
    { name: "text", type: "string", description: "Message text.", sensitive: true  },
    { name: "ts", type: "string", description: "Slack message timestamp." },
    { name: "thread_ts", type: "string", description: "Parent thread timestamp when this message is a thread reply." },
    { name: "team", type: "string", description: "Slack workspace (team) id." },
    { name: "event_ts", type: "string", description: "Slack event timestamp." },
    { name: "blocks", type: "array", description: "Slack Block Kit blocks attached to the message." },
  ],
  displayOrder: 20,
};
