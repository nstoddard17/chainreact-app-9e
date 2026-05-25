import { z } from "zod";

/**
 * Resolved-config schema for the Monday `list_users` action —
 * Slice 3.MONDAY-2.
 *
 * Pure read. V1 field names preserved:
 *   - `limit` (optional) — 1..100, default 25.
 *   - `kind` (optional) — `all` (default) / `non_guests` / `guests` /
 *     `non_pending`. V1 supports the same enum.
 *
 * No cursor — Monday's `users` field is limit-bounded only.
 */
export const ListUsersConfigSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(25),
    kind: z
      .enum(["all", "non_guests", "guests", "non_pending"])
      .default("all"),
  })
  .strict();

export type ListUsersConfig = z.infer<typeof ListUsersConfigSchema>;
