import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:cancel_scheduled_message`.
 *
 * Mirrors `cancelScheduledMessage.schema.ts`:
 *   - `channel`             (required) — combobox sourced.
 *   - `scheduledMessageId`  (required) — Slack scheduled-message id
 *                                        from `schedule_message.output`.
 *
 * Required scope: `chat:write`.
 *
 * Outputs match `cancelScheduledMessage.ts:return` exactly.
 */
export const slackCancelScheduledMessageMeta: ActionMeta = {
  key: "slack:cancel_scheduled_message",
  provider: "slack",
  type: "cancel_scheduled_message",
  displayName: "Cancel Scheduled Message",
  description:
    "Cancel a Slack message previously created by Schedule Message before it has been delivered. Slack returns `invalid_scheduled_message_id` when the id is unknown or the message has already been sent.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "channel",
      sensitivity: "recipient",
      label: "Channel",
      description:
        "Channel the scheduled message was created against. Searchable picker over public + private channels visible to the bot; the saved value is the channel id.",
      type: "combobox",
      optionsSource: "slack:channels",
      required: true,
      placeholder: "Search channels…",
    },
    {
      name: "scheduledMessageId",
      label: "Scheduled message id",
      description:
        "Slack scheduled-message id. Wire from an upstream Schedule Message action's `scheduledMessageId` output.",
      type: "text",
      required: true,
      placeholder: "Q1298393284",
    },
  ],
  outputs: [
    {
      name: "channel",
      type: "string",
      description: "Slack channel id the cancellation targeted (echoed).",
    },
    {
      name: "scheduledMessageId",
      type: "string",
      description: "Cancelled scheduled-message id (echoed).",
    },
    {
      name: "cancelled",
      type: "boolean",
      description: "Always true on successful cancellation.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 100,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
