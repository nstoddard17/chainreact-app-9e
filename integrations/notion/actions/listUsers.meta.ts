import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `notion:list_users`.
 *
 * Mirrors `listUsers.schema.ts`:
 *   - `pageSize` (optional) — 1..100 (Notion's hard ceiling).
 *
 * `startCursor` is server-managed; intentionally NOT exposed.
 *
 * No `includeGuests` field — V1's filter relied on a broken
 * `is_guest` heuristic. Workflow authors that need to filter can
 * branch downstream on `personEmail` / `type`.
 *
 * Outputs match `listUsers.ts:return` — `{users: array, nextCursor,
 * hasMore}`. Each `users` entry matches `get_user`'s output shape
 * (shared via `mapNotionUser`).
 */
export const notionListUsersMeta: ActionMeta = {
  key: "notion:list_users",
  provider: "notion",
  type: "list_users",
  displayName: "List Users",
  description:
    "List workspace users. Single page of results — call again with `nextCursor` for additional pages. Each entry matches Get User's output shape (person vs. bot polymorphism resolved). No `total_count` — Notion's API never returns a workspace-wide total.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "pageSize",
      label: "Page size",
      description:
        "Optional. Max users per call (1..100, Notion's hard ceiling). Omit to use Notion's default.",
      type: "number",
      required: false,
      numeric: { min: 1, max: 100, integer: true, step: 1 },
    },
  ],
  outputs: [
    {
      name: "users",
      type: "array",
      description:
        "Array of users — each entry matches Get User's output shape (`{userId, object, type, name, avatarUrl, personEmail, botOwnerType, botOwnerUserId, botWorkspaceName}`).",
    },
    {
      name: "nextCursor",
      type: "string",
      description: "Opaque pagination cursor for the next page. Null when there are no more pages.",
    },
    {
      name: "hasMore",
      type: "boolean",
      description: "True when another page is available.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 160,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
