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
    itemId: z.string().min(1, "itemId is required."),
  })
  .strict();

export type DeleteItemConfig = z.infer<typeof DeleteItemConfigSchema>;
