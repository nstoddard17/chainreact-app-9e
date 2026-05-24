import { z } from "zod";

/**
 * Resolved-config schema for the Monday `move_item` action —
 * Slice 3.MONDAY-2.
 *
 * V1 field names preserved:
 *   - `boardId` (required) — validated client-side; `move_item_to_group`
 *     itself doesn't take a board id (Monday infers it from the
 *     `itemId`), but the schema keeps `boardId` required so the action
 *     stays scoped to a specific board context.
 *   - `itemId` (required)
 *   - `targetGroupId` (required)
 */
export const MoveItemConfigSchema = z
  .object({
    boardId: z
      .string({ required_error: "boardId is required." })
      .min(1, "boardId is required."),
    itemId: z
      .string({ required_error: "itemId is required." })
      .min(1, "itemId is required."),
    targetGroupId: z
      .string({ required_error: "targetGroupId is required." })
      .min(1, "targetGroupId is required."),
  })
  .strict();

export type MoveItemConfig = z.infer<typeof MoveItemConfigSchema>;
