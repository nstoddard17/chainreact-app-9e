import { z } from "zod";

/**
 * Resolved-config schema for the Monday `get_item` action —
 * Slice 3.MONDAY-2.
 *
 * Pure read. V1 field names preserved:
 *   - `boardId` (required) — for scope-narrowing in the UI; the
 *     `items(ids:)` GraphQL field doesn't actually use it.
 *   - `itemId` (required)
 */
export const GetItemConfigSchema = z
  .object({
    boardId: z
      .string({ required_error: "boardId is required." })
      .min(1, "boardId is required."),
    itemId: z
      .string({ required_error: "itemId is required." })
      .min(1, "itemId is required."),
  })
  .strict();

export type GetItemConfig = z.infer<typeof GetItemConfigSchema>;
