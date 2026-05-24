import { z } from "zod";

/**
 * Resolved-config schema for `dropbox:get_file_metadata` —
 * Slice 3.DROPBOX-2. Pure read of a file or folder at `path`.
 */
export const GetFileMetadataConfigSchema = z
  .object({
    path: z.string().min(1, "path is required."),
  })
  .strict();

export type GetFileMetadataConfig = z.infer<typeof GetFileMetadataConfigSchema>;
