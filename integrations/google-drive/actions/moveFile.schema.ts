import { z } from "zod";

/**
 * Resolved-config schema for the Google Drive move_file action.
 *
 * Drive's "move" semantics require knowing both the new parent (to add)
 * and the existing parents (to remove). The handler reads existing parents
 * via `filesGet` then PATCHes via `filesUpdate?addParents=&removeParents=`.
 *
 * Both `fileId` and `newParentFolderId` are required — Q11 demands the
 * workflow author make the choice explicit. There is no "move to root"
 * shortcut; pass the literal string `"root"` as `newParentFolderId` to
 * land at My Drive root (Drive's API treats `"root"` as the implicit
 * root folder id).
 */
export const MoveFileConfigSchema = z
  .object({
    fileId: z.string().min(1, "fileId is required."),
    newParentFolderId: z
      .string()
      .min(1, "newParentFolderId is required."),
  })
  .strict();

export type MoveFileConfig = z.infer<typeof MoveFileConfigSchema>;
