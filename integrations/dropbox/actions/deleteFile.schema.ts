import { z } from "zod";

/**
 * Resolved-config schema for `dropbox:delete_file` — Slice 3.DROPBOX-2.
 * High-risk / destructive (Dropbox moves to trash; recoverable ~30d).
 * The handler emits a structural-only output.
 */
export const DeleteFileConfigSchema = z
  .object({
    path: z.string().min(1, "path is required."),
  })
  .strict();

export type DeleteFileConfig = z.infer<typeof DeleteFileConfigSchema>;
