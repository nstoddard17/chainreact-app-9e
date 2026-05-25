import { z } from "zod";

/**
 * Resolved-config schema for the Monday `duplicate_item` action —
 * Slice 3.MONDAY-4.
 *
 * V1 field names preserved:
 *   - `boardId` (required)
 *   - `itemId` (required) — the source item.
 *   - `withUpdates` (optional, default false) — copy the item's updates
 *     into the clone. Accepts boolean; V1 also coerced string "true".
 */
export const DuplicateItemConfigSchema = z
  .object({
    boardId: z
      .string({ required_error: "boardId is required." })
      .min(1, "boardId is required."),
    itemId: z
      .string({ required_error: "itemId is required." })
      .min(1, "itemId is required."),
    withUpdates: z.boolean().default(false),
  })
  .strict();

export type DuplicateItemConfig = z.infer<typeof DuplicateItemConfigSchema>;
