import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:list_scheduled_messages`.
 *
 * Mirrors `listScheduledMessages.schema.ts`:
 *   - `channel` (optional) — combobox sourced from `slack:channels`.
 *                            When absent, Slack returns every
 *                            scheduled message the bot owns workspace-
 *                            wide.
 *   - `limit`   (optional) — per-page max, 1..1000.
 *   - `oldest`  (optional) — Slack timestamp lower bound on `post_at`.
 *   - `latest`  (optional) — Slack timestamp upper bound on `post_at`.
 *   - `cursor`  — server-managed pagination handle; NOT exposed.
 *
 * Required scope: `chat:write` (shared with `chat.scheduleMessage`).
 *
 * Outputs match `listScheduledMessages.ts:return` exactly:
 * `{messages, count, hasMore, nextCursor}`.
 */
export const slackListScheduledMessagesMeta: ActionMeta = {
  key: "slack:list_scheduled_messages",
  provider: "slack",
  type: "list_scheduled_messages",
  displayName: "List Scheduled Messages",
  description:
    "List Slack messages the bot has scheduled but not yet delivered via chat.scheduledMessages.list. Optionally narrow to a single channel or filter by post-time window. Returns a single page; loop with the returned `nextCursor` for subsequent pages.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "channel",
      sensitivity: "recipient",
      label: "Channel",
      description:
        "Optional. Narrow results to a single channel. Leave blank to list workspace-wide. Searchable picker over public + private channels visible to the bot; saved value is the channel id.",
      type: "combobox",
      optionsSource: "slack:channels",
      allowManualEntry: true,
      required: false,
      placeholder: "Search channels or paste a channel ID",
    },
    {
      name: "limit",
      label: "Limit",
      description:
        "Maximum scheduled messages to return per page (Slack default 100, max 1000).",
      type: "number",
      required: false,
      numeric: { min: 1, max: 1000, integer: true, step: 1 },
      placeholder: "100",
    },
    {
      name: "oldest",
      label: "Oldest post-at timestamp",
      description:
        "Optional Slack timestamp lower bound (`<seconds>.<microseconds>`). Filters by scheduled `post_at`, not creation time.",
      type: "text",
      required: false,
      advanced: true,
      placeholder: "1700000000.000100",
    },
    {
      name: "latest",
      label: "Latest post-at timestamp",
      description:
        "Optional Slack timestamp upper bound (`<seconds>.<microseconds>`). Filters by scheduled `post_at`, not creation time.",
      type: "text",
      required: false,
      advanced: true,
      placeholder: "1700000999.999999",
    },
  ],
  outputs: [
    {
      name: "messages",
      type: "array",
      description:
        "Array of scheduled-message records as Slack returns them (each carries `id`, `channel_id`, `post_at`, `text`, …). Marked sensitive — scheduled message bodies redact from the run-detail API and variable picker preview (token wiring still works).",
      sensitive: true,
    },
    {
      name: "count",
      type: "number",
      description: "Convenience count of records returned in this page.",
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
        "Opaque pagination cursor. Pass back into a subsequent List Scheduled Messages call via a `{{...}}` reference to fetch the next page.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 150,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
