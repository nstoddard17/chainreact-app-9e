import { z } from "zod";

/**
 * Resolved-config schema for the Monday `list_boards` action —
 * Slice 3.MONDAY-2.
 *
 * Pure read. V1 field names preserved:
 *   - `limit` (optional) — 1..100, default 25.
 *   - `cursor` (optional) — stringified 1-based page index for
 *     forward pagination. Monday's `boards` field uses page-based
 *     pagination (not opaque cursors); V2 normalizes to a `cursor`
 *     string field for symmetry with `list_items` so downstream
 *     pagination UX stays consistent across Monday actions.
 */
export const ListBoardsConfigSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).optional(),
  })
  .strict();

export type ListBoardsConfig = z.infer<typeof ListBoardsConfigSchema>;
