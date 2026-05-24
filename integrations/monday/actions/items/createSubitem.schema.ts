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
 * Per D-MON6, the SUBITEMS board id is intentionally opaque to workflow
 * authors — Monday's `create_subitem` mutation resolves it from the
 * parent item. The optional `boardId` below is a DIFFERENT concept: it's
 * the PARENT item's board, a UI-only scope-narrower so the builder's
 * `parentItemId` picker (`monday:items`) can cascade. The handler
 * ignores it; the subitems board stays hidden (D-MON6 preserved).
 *
 * V1 field names preserved exactly:
 *   - `parentItemId` (required)
 *   - `subitemName` (required) — V1 also accepts legacy `itemName`
 *     but V2 standardizes on `subitemName` for clarity.
 *   - `columnValues` (optional)
 *   - `boardId` (optional, UI-scope — MONDAY-6) — parent item's board;
 *     handler ignores it. Mirrors the OneNote `notebookId` scope pattern.
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
    boardId: z.string().min(1).optional(),
  })
  .strict();

export type CreateSubitemConfig = z.infer<typeof CreateSubitemConfigSchema>;
