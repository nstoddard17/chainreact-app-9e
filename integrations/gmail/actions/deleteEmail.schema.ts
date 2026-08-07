import { z } from "zod";

/**
 * Resolved-config schema for the Gmail `delete_email` action.
 *
 * SUPPORTED mode (the only one offered anywhere in the product):
 *   - `"trash"` → `users.messages.trash`. Moves to Gmail's trash
 *     folder, recoverable for ~30 days per Gmail's TOS (Gmail purges
 *     trashed messages after that window). Authorized by the
 *     manifest's sole scope, `gmail.modify`.
 *
 * RETIRED legacy value (GOOGLE-OAUTH-REVIEW-READINESS-2):
 *   - `"permanent"` stays in the enum ONLY so that a previously saved
 *     workflow containing it parses and is rejected by the handler
 *     with a clear "no longer supported" error instead of a cryptic
 *     schema failure — and is NEVER silently converted to trash
 *     (that would change the meaning of a destructive step). It is
 *     not offered by the builder select, and no generation path
 *     (builder / templates / React Agent / catalog metadata) emits
 *     it. Why retired: Google authorizes `users.messages.delete`
 *     ONLY under the full-mailbox `https://mail.google.com/` scope,
 *     which ChainReact deliberately does not request — the mode
 *     403'd in production for as long as it existed. The original
 *     comment here claiming `gmail.modify` covers messages.delete
 *     was wrong.
 *
 * V1 fields intentionally dropped (`.strict()` rejects):
 *   - `permanentDelete: boolean` — V1's silent-default boolean
 *     (defaulted to false = trash).
 *   - `searchQuery` — V1's bulk-delete-by-search compound action.
 *   - Array shape `messageId`.
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
