import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:list_channels`.
 *
 * Mirrors `listChannels.schema.ts`:
 *   - `kind`            (optional select) — public / private / both.
 *   - `excludeArchived` (optional boolean).
 *   - `limit`           (optional number, 1..1000).
 *   - `cursor`          — server-managed pagination handle; NOT exposed.
 *
 * Required scopes: `channels:read` + `groups:read` (granted).
 *
 * Outputs mirror `listChannels.ts:return` — `{channels, count, hasMore,
 * nextCursor}`.
 */
export const slackListChannelsMeta: ActionMeta = {
  key: "slack:list_channels",
  provider: "slack",
  type: "list_channels",
  displayName: "List Channels",
  description:
    "List Slack channels visible to the bot via conversations.list. Pagination is single-page; loop with the returned `nextCursor` for subsequent pages.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "kind",
      label: "Channel kind",
      description:
        "Which kinds of channels to include. Defaults to public when omitted (handler-side).",
      type: "select",
      required: false,
      options: [
        { value: "public", label: "Public channels" },
        { value: "private", label: "Private channels" },
        { value: "both", label: "Public + private" },
      ],
    },
    {
      name: "excludeArchived",
      label: "Exclude archived",
      description:
        "When enabled, archived channels are omitted from results (handler default is true).",
      type: "boolean",
      required: false,
    },
    {
      name: "limit",
      label: "Limit",
      description:
        "Maximum channels to return per page (Slack default 100, max 1000).",
      type: "number",
      required: false,
      numeric: { min: 1, max: 1000, integer: true, step: 1 },
      placeholder: "100",
    },
  ],
  outputs: [
    {
      name: "channels",
      type: "array",
      description:
        "Array of Slack channel records as Slack returns them (each carries `id`, `name`, `is_private`, `is_archived`, `num_members`, …).",
    },
    {
      name: "count",
      type: "number",
      description: "Convenience count of channels returned in this page.",
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
        "Opaque pagination cursor. Pass back into a subsequent List Channels call via a `{{...}}` reference to fetch the next page.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 160,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
