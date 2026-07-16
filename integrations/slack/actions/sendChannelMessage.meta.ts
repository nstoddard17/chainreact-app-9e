import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:send_channel_message`.
 *
 * Mirrors `sendChannelMessage.schema.ts` exactly:
 *   - `channel` (required) — Slack channel id. Combobox sourced from
 *     `slack:channels` (Slice 3.32 resolver). The runtime schema also
 *     accepts `#name`, but the picker surfaces ids; authors who need
 *     `#name` can still wire a `{{...}}` reference if upstream.
 *   - `text` (required) — message body (textarea).
 *   - `threadTs` (optional) — Slack timestamp to post as a thread reply.
 *
 * Required scope: `chat:write` (already granted by the Slack manifest).
 *
 * Outputs match `sendChannelMessage.ts:return` exactly: `channel`, `ts`,
 * and the Slack `message` payload (object) for downstream drill-through.
 *
 * Slice 3.35 — first Group A messaging meta. Slack stays out of
 * COVERED_PROVIDERS until the rest of the messaging arc lands; the
 * structural test continues to gate on full handler-to-meta coverage.
 */
export const slackSendChannelMessageMeta: ActionMeta = {
  key: "slack:send_channel_message",
  provider: "slack",
  type: "send_channel_message",
  displayName: "Send Channel Message",
  description:
    "Post a message to a Slack channel via chat.postMessage. Optionally posts as a thread reply when Thread Timestamp is provided. Requires the Slack chat:write scope.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "channel",
      label: "Channel",
      description:
        "Searchable picker over public + private channels visible to the bot. The picker surfaces friendly `#name` labels; the saved value is the underlying channel id (C…/G…/D…).",
      type: "combobox",
      optionsSource: "slack:channels",
      allowManualEntry: true,
      required: true,
      sensitivity: "recipient",
      placeholder: "Search channels or paste a channel ID",
    },
    {
      name: "text",
      label: "Message",
      description:
        "Message body posted to the channel. Slack supports mrkdwn formatting (bold `*text*`, italic `_text_`, code `` `text` ``, links `<url|label>`).",
      type: "textarea",
      required: true,
      placeholder: "Hello from ChainReact",
    },
    {
      name: "threadTs",
      label: "Thread timestamp",
      description:
        "Optional. Paste or wire the `ts` output of an earlier Slack message step to reply in that thread.",
      type: "text",
      required: false,
      placeholder: "1700000000.000100",
    },
  ],
  outputs: [
    {
      name: "channel",
      type: "string",
      description: "Slack channel id the message was posted to.",
    },
    {
      name: "ts",
      type: "string",
      description:
        "Slack message timestamp. Use as `ts` / `threadTs` for follow-up update/delete/react/reply actions.",
    },
    {
      name: "message",
      type: "object",
      description:
        "Slack message payload object as returned by chat.postMessage (includes `text`, `bot_id`, `subtype`, …). Drill into specific fields via the variable picker. Marked sensitive — Slack echoes the posted body (and any user-mention names), so the object redacts from the run-detail API and variable picker preview.",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Posts to a Slack channel — visible immediately; deletion possible but conspicuous.",
};
