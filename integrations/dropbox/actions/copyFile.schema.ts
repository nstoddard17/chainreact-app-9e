import { z } from "zod";

/**
 * Resolved-config schema for `dropbox:copy_file` — Slice 3.DROPBOX-2.
 * Copies `fromPath` to `toPath`.
 *
 * `folderPath` (optional, UI-scope — DROPBOX-4): NOT used by the handler.
 * Present so the persisted Builder config validates — the `dropbox:files`
 * file picker on `fromPath` cascades from this SOURCE folder field
 * (`dropbox:folders`). The handler ignores it; strict mode still rejects
 * genuinely unknown fields.
 */
export const CopyFileConfigSchema = z
  .object({
    fromPath: z.string().min(1, "fromPath is required."),
    toPath: z.string().min(1, "toPath is required."),
    autorename: z.boolean().default(false),
    folderPath: z.string().optional(),
  })
  .strict();

export type CopyFileConfig = z.infer<typeof CopyFileConfigSchema>;
