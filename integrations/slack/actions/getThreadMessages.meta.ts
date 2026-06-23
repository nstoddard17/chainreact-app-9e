import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:get_thread_messages`.
 *
 * Mirrors `getThreadMessages.schema.ts`:
 *   - `channel`  (required) — combobox sourced from `slack:channels`.
 *   - `threadTs` (required) — parent message timestamp.
 *   - `limit` / `oldest` / `latest` — same semantics as get_messages.
 *   - `cursor` — server-managed; NOT exposed.
 *
 * Required scope: `channels:history` / `groups:history` (granted).
 *
 * Outputs match `getThreadMessages.ts:return` exactly.
 */
export const slackGetThreadMessagesMeta: ActionMeta = {
  key: "slack:get_thread_messages",
  provider: "slack",
  type: "get_thread_messages",
  displayName: "Get Thread Messages",
  description:
    "Read a Slack thread (parent + replies) via conversations.replies. `messages[0]` is the parent; subsequent entries are replies in chronological order. Returns a single page; loop with the returned `nextCursor` for subsequent pages.",
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
      name: "threadTs",
      label: "Thread timestamp",
      description:
        "Parent message timestamp (`<seconds>.<microseconds>`). Wire from an upstream Slack message action's `ts` output.",
      type: "text",
      required: true,
      placeholder: "1700000000.000100",
    },
    {
      name: "limit",
      label: "Limit",
      description:
        "Maximum replies to return per page (Slack default 100, max 1000).",
      type: "number",
      required: false,
      numeric: { min: 1, max: 1000, integer: true, step: 1 },
      placeholder: "100",
    },
    {
      name: "oldest",
      label: "Oldest timestamp",
      description:
        "Optional Slack timestamp lower bound (`<seconds>.<microseconds>`).",
      type: "text",
      required: false,
      placeholder: "1700000000.000100",
    },
    {
      name: "latest",
      label: "Latest timestamp",
      description:
        "Optional Slack timestamp upper bound (`<seconds>.<microseconds>`).",
      type: "text",
      required: false,
      placeholder: "1700000999.999999",
    },
  ],
  outputs: [
    {
      name: "messages",
      type: "array",
      description:
        "Array of Slack message objects — `messages[0]` is the thread parent, subsequent entries are replies in chronological order. Marked sensitive — message bodies redact from the run-detail API and variable picker preview (token wiring still works).",
      sensitive: true,
    },
    {
      name: "count",
      type: "number",
      description: "Convenience count of messages returned in this page.",
    },
    {
      name: "hasMore",
      type: "boolean",
      description: "True when Slack indicates more pages exist.",
    },
    {
      name: "nextCursor",
      type: "string",
      description:
        "Opaque pagination cursor. Pass back into a subsequent Get Thread Messages call via a `{{...}}` reference to fetch the next page.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 80,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
