import { z } from "zod";

/**
 * Resolved-config schema for the Monday `create_subitem` action —
 * Slice 3.MONDAY-2.
 *
 * V1 field names preserved exactly:
 *   - `parentItemId` (required)
 *   - `subitemName` (required) — V1 also accepts legacy `itemName`
 *     but V2 standardizes on `subitemName` for clarity.
 *   - `columnValues` (optional)
 *
 * Per D-MON6, the subitems board id is intentionally opaque to
 * workflow authors — Monday's `create_subitem` mutation resolves it
 * from the parent item.
 */
export const CreateSubitemConfigSchema = z
  .object({
    parentItemId: z
      .string({ required_error: "parentItemId is required." })
      .min(1, "parentItemId is required."),
    subitemName: z
      .string({ required_error: "subitemName is required." })
      .min(1, "subitemName is required."),
    columnValues: z.union([z.string(), z.record(z.unknown())]).optional(),
  })
  .strict();

export type CreateSubitemConfig = z.infer<typeof CreateSubitemConfigSchema>;
