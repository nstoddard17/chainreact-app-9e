import { z } from "zod";

/**
 * Resolved-config schema for the Monday `list_updates` action —
 * Slice 3.MONDAY-4.
 *
 * Pure read. V1 field names preserved:
 *   - `itemId` (required)
 *   - `limit` (optional) — 1..100, default 25.
 *   - `boardId` (optional, UI-scope — MONDAY-6) — NOT used by the
 *     GraphQL call; the handler ignores it. Present so the builder's
 *     `itemId` picker (`monday:items`) can cascade. Mirrors the OneNote
 *     `notebookId` scope pattern.
 */
export const ListUpdatesConfigSchema = z
  .object({
    itemId: z
      .string({ required_error: "itemId is required." })
      .min(1, "itemId is required."),
    limit: z.number().int().min(1).max(100).default(25),
    boardId: z.string().min(1).optional(),
  })
  .strict();

export type ListUpdatesConfig = z.infer<typeof ListUpdatesConfigSchema>;
