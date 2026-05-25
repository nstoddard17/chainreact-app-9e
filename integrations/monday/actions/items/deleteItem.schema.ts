import { z } from "zod";

/**
 * Resolved-config schema for the Monday `delete_item` action —
 * Slice 3.MONDAY-2.
 *
 * V1 field names preserved:
 *   - `boardId` (required) — validated client-side but Monday's
 *     `delete_item` mutation doesn't actually use it; the handler
 *     keeps the requirement so the action stays scoped to a specific
 *     board context (workflow authors typically wire `boardId` from
 *     upstream state).
 *   - `itemId` (required)
 *
 * Per D-MON4, this is a destructive action. Monday's delete is a soft
 * delete (UI-recoverable from the recycle bin) but the V2 metadata
 * later marks the trio (delete / archive / duplicate-board) as
 * `destructive: true` + `requiresConfirmation: true`. The schema
 * itself doesn't carry that flag — it's a meta-layer concern.
 */
export const DeleteItemConfigSchema = z
  .object({
    boardId: z
      .string({ required_error: "boardId is required." })
      .min(1, "boardId is required."),
    itemId: z
      .string({ required_error: "itemId is required." })
      .min(1, "itemId is required."),
  })
  .strict();

export type DeleteItemConfig = z.infer<typeof DeleteItemConfigSchema>;
