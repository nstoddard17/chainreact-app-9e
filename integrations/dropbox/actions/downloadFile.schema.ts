import { z } from "zod";

/**
 * Resolved-config schema for `dropbox:download_file` — Slice 3.DROPBOX-2.
 * FileRef producer: downloads `path` and stages the bytes
 * (kind=v2_storage). `path` is the full Dropbox file path.
 */
export const DownloadFileConfigSchema = z
  .object({
    path: z.string().min(1, "path is required."),
  })
  .strict();

export type DownloadFileConfig = z.infer<typeof DownloadFileConfigSchema>;
