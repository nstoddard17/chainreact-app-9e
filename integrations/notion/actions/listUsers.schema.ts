import { z } from "zod";

/**
 * Resolved-config schema for the Notion `list_users` action.
 *
 * Notion 2.1 Commit 2 — user lookups.
 *
 * Strict schema. Single-page list by default; no auto-pagination.
 * `pageSize` cap mirrors V2's `queryDatabase` + `search` convention
 * (Notion's hard ceiling).
 *
 * V1 chrome NOT ported:
 *   - `includeGuests` filter (relied on V1's broken `is_guest`
 *     heuristic). Workflow authors that need to filter can branch
 *     downstream on `personEmail` / `type`.
 */
export const ListUsersConfigSchema = z
  .object({
    /** Optional — 1..100 per Notion's hard ceiling. */
    pageSize: z.number().int().positive().max(100).optional(),
    /** Optional pagination cursor from a prior response's nextCursor. */
    startCursor: z.string().optional(),
  })
  .strict();

export type ListUsersConfig = z.infer<typeof ListUsersConfigSchema>;
