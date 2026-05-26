import { z } from "zod";

/**
 * Resolved-config schema for the OneDrive delete_item action.
 *
 * `itemId` is required. Idempotent on 404 (handler swallows
 * NotFoundError and returns `alreadyMissing: true` — same convention
 * as Slice 4 deleteFile + Slice 7 delete_event).
 */
export const DeleteItemConfigSchema = z
  .object({
    // UI-scope `parentItemId` (ONEDRIVE-META-3) — NOT used by the handler.
    // Present so the `itemId` picker cascades off this source-folder field.
    // Handler-ignored; mirrors the Trello `boardId` UI-scope pattern.
    parentItemId: z.string().optional(),
    itemId: z.string().min(1, "itemId is required."),
  })
  .strict();

export type DeleteItemConfig = z.infer<typeof DeleteItemConfigSchema>;
