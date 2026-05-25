import { z } from "zod";

/**
 * Resolved-config schema for `dropbox:delete_file` — Slice 3.DROPBOX-2.
 * High-risk / destructive (Dropbox moves to trash; recoverable ~30d).
 * The handler emits a structural-only output.
 *
 * `folderPath` (optional, UI-scope — DROPBOX-4): NOT used by the handler.
 * Present so the persisted Builder config validates — the `dropbox:files`
 * file picker on `path` cascades from this folder field
 * (`dropbox:folders`). The handler ignores it; strict mode still rejects
 * genuinely unknown fields.
 */
export const DeleteFileConfigSchema = z
  .object({
    path: z.string().min(1, "path is required."),
    folderPath: z.string().optional(),
  })
  .strict();

export type DeleteFileConfig = z.infer<typeof DeleteFileConfigSchema>;
