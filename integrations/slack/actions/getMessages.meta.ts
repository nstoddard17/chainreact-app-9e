import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:get_messages`.
 *
 * Mirrors `getMessages.schema.ts`:
 *   - `channel` (required) — Slack channel id (combobox sourced).
 *   - `limit`   (optional) — page size, 1..1000.
 *   - `oldest`  (optional) — Slack timestamp filter (≥ oldest).
 *   - `latest`  (optional) — Slack timestamp filter (≤ latest).
 *   - `cursor`  — server-managed pagination cursor; NOT exposed in
 *                 the meta. Workflow authors paginate by calling the
 *                 action again with `{{prev.nextCursor}}`.
 *
 * Required scopes: `channels:history`, `groups:history` (private
 * channels) — both granted by the Slack manifest.
 *
 * Outputs match `getMessages.ts:return` exactly.
 */
export const slackGetMessagesMeta: ActionMeta = {
  key: "slack:get_messages",
  provider: "slack",
  type: "get_messages",
  displayName: "Get Messages",
  description:
    "Read a window of messages from a Slack channel via conversations.history. Returns a single page; loop with the returned `nextCursor` for subsequent pages.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "channel",
      label: "Channel",
      description:
        "Searchable picker over public + private channels visible to the bot. The saved value is the underlying channel id (C…/G…/D…).",
      type: "combobox",
      optionsSource: "slack:channels",
      required: true,
      placeholder: "Search channels…",
    },
    {
      name: "limit",
      label: "Limit",
      description:
        "Maximum messages to return per page (Slack default 100, max 1000).",
      type: "number",
      required: false,
      numeric: { min: 1, max: 1000, integer: true, step: 1 },
      placeholder: "100",
    },
    {
      name: "oldest",
      label: "Oldest timestamp",
      description:
        "Optional Slack timestamp lower bound (`<seconds>.<microseconds>`). Messages older than this are excluded.",
      type: "text",
      required: false,
      placeholder: "1700000000.000100",
    },
    {
      name: "latest",
      label: "Latest timestamp",
      description:
        "Optional Slack timestamp upper bound (`<seconds>.<microseconds>`). Messages newer than this are excluded.",
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
        "Array of Slack message objects (each carries `ts`, `text`, `user`, `subtype`, …). Iterate downstream to fan-out per message.",
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
        "Opaque pagination cursor. Pass back into a subsequent Get Messages call via a `{{...}}` reference to fetch the next page (the cursor field is not user-editable in the form — wire it through variables).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 70,
};
