import { z } from "zod";

/**
 * Resolved-config schema for `dropbox:copy_file` — Slice 3.DROPBOX-2.
 * Copies `fromPath` to `toPath`.
 */
export const CopyFileConfigSchema = z
  .object({
    fromPath: z.string().min(1, "fromPath is required."),
    toPath: z.string().min(1, "toPath is required."),
    autorename: z.boolean().default(false),
  })
  .strict();

export type CopyFileConfig = z.infer<typeof CopyFileConfigSchema>;
