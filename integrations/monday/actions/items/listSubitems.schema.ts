import { z } from "zod";

/**
 * Resolved-config schema for the Monday `list_subitems` action —
 * Slice 3.MONDAY-4.
 *
 * Pure read. V1 field name preserved:
 *   - `parentItemId` (required) — the item whose subitems to list.
 *   - `boardId` (optional, UI-scope — MONDAY-6) — parent item's board;
 *     NOT used by the GraphQL call (handler ignores it). Present so the
 *     builder's `parentItemId` picker (`monday:items`) can cascade.
 *     Mirrors the OneNote `notebookId` scope pattern.
 */
export const ListSubitemsConfigSchema = z
  .object({
    parentItemId: z
      .string({ required_error: "parentItemId is required." })
      .min(1, "parentItemId is required."),
    boardId: z.string().min(1).optional(),
  })
  .strict();

export type ListSubitemsConfig = z.infer<typeof ListSubitemsConfigSchema>;
