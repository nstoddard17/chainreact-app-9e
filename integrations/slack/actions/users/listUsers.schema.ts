import { z } from "zod";

/**
 * Resolved-config schema for the Slack list_users action
 * (Slack 2.3 Commit 4).
 *
 * Reads workspace members via `users.list` with cursor pagination.
 * The handler does NOT auto-loop pages — workflow authors paginate
 * by calling the action again with the previous response's
 * `nextCursor`. Slack's `users.list` is Tier 2 rate-limited
 * (20 req/min per workspace).
 *
 * `limit` is Slack's per-page maximum (1–1000).
 *
 * `cursor` is opaque pagination state passed through from a previous
 * call's `output.nextCursor`. Empty / absent means start at the
 * first page.
 *
 * `.strict()` rejects unknown keys.
 */
export const ListUsersConfigSchema = z
  .object({
    limit: z.number().int().min(1).max(1000).optional(),
    cursor: z.string().min(1).optional(),
  })
  .strict();
export type ListUsersConfig = z.infer<typeof ListUsersConfigSchema>;
