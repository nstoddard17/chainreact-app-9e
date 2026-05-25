import { z } from "zod";

/**
 * Resolved-config schema for the Monday `archive_item` action —
 * Slice 3.MONDAY-4.
 *
 * V1 field names preserved. V1's archive_item mutation only needs
 * `itemId`; `boardId` is kept as an optional scope-context field so the
 * action can stay board-scoped in the builder (matches the delete/move
 * pattern), but the handler doesn't pass it to the mutation.
 *
 * Archive is RECOVERABLE (restorable from Monday's UI archive) — less
 * destructive than `delete_item`. The handler returns structural-only
 * output regardless.
 */
export const ArchiveItemConfigSchema = z
  .object({
    itemId: z
      .string({ required_error: "itemId is required." })
      .min(1, "itemId is required."),
    boardId: z.string().min(1).optional(),
  })
  .strict();

export type ArchiveItemConfig = z.infer<typeof ArchiveItemConfigSchema>;
