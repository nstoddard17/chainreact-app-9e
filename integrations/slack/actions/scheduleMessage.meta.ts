import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:schedule_message`.
 *
 * Mirrors `scheduleMessage.schema.ts`:
 *   - `channel`  (required) — combobox sourced from `slack:channels`.
 *   - `text`     (required) — message body (textarea).
 *   - `postAt`   (required) — absolute scheduled time; format
 *                             enforced at the handler boundary by
 *                             `parsePostAt`. Accepts either ISO-8601
 *                             with explicit offset or a Unix-seconds
 *                             integer string. No relative delay
 *                             (per Slack 2.1 plan §8 Q11 — no silent
 *                             "now + delta").
 *   - `threadTs` (optional) — thread reply.
 *
 * Required scope: `chat:write` (Slack chat.scheduleMessage shares
 * the scope).
 *
 * Outputs match `scheduleMessage.ts:return` exactly.
 */
export const slackScheduleMessageMeta: ActionMeta = {
  key: "slack:schedule_message",
  provider: "slack",
  type: "schedule_message",
  displayName: "Schedule Message",
  description:
    "Schedule a Slack message to post at a future time via chat.scheduleMessage. Cancel before delivery via Cancel Scheduled Message (use the returned `scheduledMessageId`). No silent 'now + delta' mode — compute the absolute time upstream if a relative delay is needed.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "channel",
      sensitivity: "recipient",
      label: "Channel",
      description:
        "Searchable picker over public + private channels visible to the bot. The saved value is the underlying channel id (C…/G…/D…).",
      type: "combobox",
      optionsSource: "slack:channels",
      allowManualEntry: true,
      required: true,
      placeholder: "Search channels or paste a channel ID",
    },
    {
      name: "text",
      label: "Message",
      description:
        "Message body to deliver at the scheduled time. Slack mrkdwn formatting supported.",
      type: "textarea",
      required: true,
      placeholder: "Reminder: team standup at 9am",
    },
    {
      name: "postAt",
      label: "Post at",
      description:
        "Absolute scheduled time, entered in **UTC** (stored as `2026-06-01T09:00:00Z`). The handler also still accepts a pasted ISO-8601 with an explicit `+HH:MM` offset OR a Unix-seconds integer string (`1748793600`) — those hydrate as editable text. Naive datetimes (no offset / no `Z`) are rejected at execute time.",
      type: "datetime-utc",
      required: true,
      placeholder: "2026-06-01T09:00:00Z",
    },
    {
      name: "threadTs",
      label: "Thread timestamp",
      description:
        "Optional Slack message timestamp — the scheduled message will be posted as a thread reply to that parent.",
      type: "text",
      required: false,
      placeholder: "1700000000.000100",
    },
  ],
  outputs: [
    {
      name: "channel",
      type: "string",
      description: "Slack channel id the message is scheduled for.",
    },
    {
      name: "scheduledMessageId",
      type: "string",
      description:
        "Slack's id for the scheduled message. Pass to Cancel Scheduled Message to cancel before delivery.",
    },
    {
      name: "postAt",
      type: "string",
      description:
        "Echo of the scheduled time as Slack stored it (Unix-seconds integer string).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 90,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Schedules a Slack post for later delivery — cancel via `cancel_scheduled_message`.",
};
