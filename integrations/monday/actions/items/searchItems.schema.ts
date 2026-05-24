import { z } from "zod";

/**
 * Resolved-config schema for the Monday `search_items` action —
 * Slice 3.MONDAY-4.
 *
 * V1 field names preserved:
 *   - `boardId` (required)
 *   - `columnValue` (required) — V1 accepted legacy `searchValue`; V2
 *     standardizes on `columnValue`. The value to match.
 *   - `columnId` (optional) — when present, search by exact column value
 *     via `items_page_by_column_values`. When absent, search by item
 *     name (client-side substring filter, matches V1).
 *   - `groupId` (optional) — client-side group filter on the result set.
 *   - `limit` (optional) — 1..100, default 25.
 */
export const SearchItemsConfigSchema = z
  .object({
    boardId: z
      .string({ required_error: "boardId is required." })
      .min(1, "boardId is required."),
    columnValue: z
      .string({ required_error: "columnValue is required." })
      .min(1, "columnValue is required."),
    columnId: z.string().min(1).optional(),
    groupId: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(100).default(25),
  })
  .strict();

export type SearchItemsConfig = z.infer<typeof SearchItemsConfigSchema>;
