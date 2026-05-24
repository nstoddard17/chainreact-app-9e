import { z } from "zod";

/**
 * Resolved-config schema for the Monday `create_item` action —
 * Slice 3.MONDAY-2.
 *
 * V1-preserved camelCase field names exactly:
 *   - `boardId` (required)
 *   - `groupId` (required)
 *   - `itemName` (required)
 *   - `columnValues` (optional)
 *
 * `columnValues` accepts either:
 *   - a JSON-encoded STRING (workflow author types raw JSON in a
 *     textarea, per D-MON7), OR
 *   - a structured object (downstream nodes can feed in
 *     `{{prevNode.columnValues}}` directly).
 *
 * The handler serializes whichever shape arrives into Monday's
 * required JSON-encoded-string wire shape. Strict mode rejects
 * unknown fields.
 */
export const CreateItemConfigSchema = z
  .object({
    boardId: z
      .string({ required_error: "boardId is required." })
      .min(1, "boardId is required."),
    groupId: z
      .string({ required_error: "groupId is required." })
      .min(1, "groupId is required."),
    itemName: z
      .string({ required_error: "itemName is required." })
      .min(1, "itemName is required."),
    columnValues: z.union([z.string(), z.record(z.unknown())]).optional(),
  })
  .strict();

export type CreateItemConfig = z.infer<typeof CreateItemConfigSchema>;
