import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:list_users`.
 *
 * Mirrors `listUsers.schema.ts`:
 *   - `limit`  (optional number, 1..1000).
 *   - `cursor` — server-managed pagination handle; NOT exposed.
 *
 * Slack's `users.list` is Tier 2 rate-limited (20 req/min per
 * workspace); the handler does NOT auto-loop pages.
 *
 * Required scope: `users:read` (granted).
 *
 * Outputs mirror `listUsers.ts:return` — `{users, count, hasMore,
 * nextCursor}`.
 */
export const slackListUsersMeta: ActionMeta = {
  key: "slack:list_users",
  provider: "slack",
  type: "list_users",
  displayName: "List Users",
  description:
    "List workspace members via users.list. Returns a single page; loop with the returned `nextCursor` for subsequent pages. Slack rate-limits this endpoint at Tier 2 (20 req/min per workspace).",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "limit",
      label: "Limit",
      description:
        "Maximum users to return per page (Slack max 1000).",
      type: "number",
      required: false,
      numeric: { min: 1, max: 1000, integer: true, step: 1 },
      placeholder: "200",
    },
  ],
  outputs: [
    {
      name: "users",
      type: "array",
      description:
        "Array of Slack user records as Slack returns them (each carries `id`, `name`, `real_name`, `profile`, `is_admin`, `is_bot`, …).",
    },
    {
      name: "count",
      type: "number",
      description: "Convenience count of users returned in this page.",
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
        "Opaque pagination cursor. Pass back into a subsequent List Users call via a `{{...}}` reference to fetch the next page.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 290,
};
