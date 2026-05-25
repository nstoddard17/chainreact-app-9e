import { z } from "zod";

/**
 * Resolved-config schema for the Gmail `delete_email` action.
 *
 * Per parity-gmail.md decision 2: REQUIRED `deleteMode` enum, no
 * silent default. The two delete paths have meaningfully different
 * consequences and the workflow author must choose explicitly:
 *   - `"trash"` → `users.messages.trash`. Moves to Gmail's trash
 *     folder, recoverable for 30 days per Gmail's TOS.
 *   - `"permanent"` → `users.messages.delete`. Permanently removes
 *     the message; NOT recoverable.
 *
 * V1 fields intentionally dropped (`.strict()` rejects):
 *   - `permanentDelete: boolean` — V1's silent-default boolean
 *     (defaulted to false = trash). V2 uses an explicit
 *     enum-discriminated mode instead, surfacing the user-visible
 *     consequence at config time.
 *   - `searchQuery` — V1's bulk-delete-by-search compound action.
 *   - Array shape `messageId`.
 *
 * Scope requirement: `gmail.modify` (Gmail 2.1 Commit 1). The
 * `users.messages.delete` endpoint requires `gmail.modify`; trash
 * does too.
 */

export const DeleteModeEnum = z.enum(["trash", "permanent"]);
export type DeleteMode = z.infer<typeof DeleteModeEnum>;

export const DeleteEmailConfigSchema = z
  .object({
    messageId: z.string().min(1, "messageId is required."),
    deleteMode: DeleteModeEnum,
  })
  .strict();

export type DeleteEmailConfig = z.infer<typeof DeleteEmailConfigSchema>;
