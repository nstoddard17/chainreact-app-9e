import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:post_interactive_blocks`.
 *
 * Mirrors `postInteractiveBlocks.schema.ts`:
 *   - `channel`  (required) — combobox sourced from `slack:channels`.
 *   - `blocks`   (required) — Slack Block Kit JSON. Rendered as a
 *                             textarea: authors paste a JSON literal
 *                             from Slack's Block Kit Builder OR a
 *                             `{{...}}` reference to an upstream
 *                             output that already carries a Block
 *                             Kit array. Per the metadata plan §4.3,
 *                             v1 deliberately does NOT introduce a
 *                             structured JSON editor — Slack's
 *                             server-side `invalid_blocks` is the
 *                             authoritative validator.
 *   - `text`     (optional) — fallback notification preview (mobile,
 *                             screen readers, summary). Per Q11 the
 *                             handler does NOT auto-generate a
 *                             fallback; pass one explicitly when the
 *                             notification preview matters.
 *   - `threadTs` (optional) — thread reply.
 *
 * Required scope: `chat:write` (shared with chat.postMessage).
 *
 * Outputs match `postInteractiveBlocks.ts:return` exactly —
 * `{channel, ts, message: object}`.
 */
export const slackPostInteractiveBlocksMeta: ActionMeta = {
  key: "slack:post_interactive_blocks",
  provider: "slack",
  type: "post_interactive_blocks",
  displayName: "Post Interactive Blocks",
  description:
    "Post a Block Kit message to a Slack channel via chat.postMessage. Authors paste Block Kit JSON from Slack's Block Kit Builder or wire a `{{...}}` reference. Slack rejects malformed payloads with `invalid_blocks`. Notification-preview text is optional — no silent fallback.",
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
      name: "blocks",
      label: "Blocks",
      description:
        "Developer option. Block Kit JSON array. Build it in Slack's Block Kit Builder (https://app.slack.com/block-kit-builder) or wire a `{{...}}` reference to an upstream array output. Each entry must be an object with a non-empty `type`.",
      type: "json",
      required: true,
      advanced: true,
      jsonShape: "array",
      placeholder: '[{"type":"section","text":{"type":"mrkdwn","text":"Hello"}}]',
    },
    {
      name: "text",
      label: "Notification text",
      description:
        "Optional fallback text Slack shows in notification previews (mobile, screen readers, summaries). When omitted, Slack uses its own block-derived fallback; no preview if the client cannot infer one.",
      type: "text",
      required: false,
      placeholder: "New deal posted",
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
        "Slack message payload object as returned by chat.postMessage (includes `text`, `blocks`, `bot_id`, …). Marked sensitive — Slack echoes the posted body and Block Kit payload, so the object redacts from the run-detail API and variable picker preview.",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 310,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Posts an interactive Block Kit message — visible immediately and may trigger user-driven workflows.",
};
