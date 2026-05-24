import { z } from "zod";

/**
 * Resolved-config schema for `dropbox:move_file` — Slice 3.DROPBOX-2.
 * Moves/renames `fromPath` to `toPath`.
 */
export const MoveFileConfigSchema = z
  .object({
    fromPath: z.string().min(1, "fromPath is required."),
    toPath: z.string().min(1, "toPath is required."),
    autorename: z.boolean().default(false),
  })
  .strict();

export type MoveFileConfig = z.infer<typeof MoveFileConfigSchema>;
