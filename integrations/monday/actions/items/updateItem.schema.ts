import { z } from "zod";

/**
 * Resolved-config schema for the Monday `update_item` action —
 * Slice 3.MONDAY-2.
 *
 * V1-preserved camelCase field names:
 *   - `boardId` (required)
 *   - `itemId` (required)
 *   - `columnId` (required)
 *   - `columnValue` (required) — can be string OR object (status /
 *     person columns expect structured payloads).
 *
 * V1 supports an optional `additionalColumns` field to merge multiple
 * columns in one call; MONDAY-2 ports that behavior so a single
 * action invocation can change several columns. The handler funnels
 * everything through `change_multiple_column_values` with a single
 * column-values map.
 */
export const UpdateItemConfigSchema = z
  .object({
    boardId: z
      .string({ required_error: "boardId is required." })
      .min(1, "boardId is required."),
    itemId: z
      .string({ required_error: "itemId is required." })
      .min(1, "itemId is required."),
    columnId: z
      .string({ required_error: "columnId is required." })
      .min(1, "columnId is required."),
    columnValue: z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.record(z.unknown()),
      z.array(z.unknown()),
    ]),
    additionalColumns: z
      .union([z.string(), z.record(z.unknown())])
      .optional(),
  })
  .strict();

export type UpdateItemConfig = z.infer<typeof UpdateItemConfigSchema>;
