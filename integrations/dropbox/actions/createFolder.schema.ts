import { z } from "zod";

/**
 * Resolved-config schema for `dropbox:create_folder` — Slice 3.DROPBOX-2.
 */
export const CreateFolderConfigSchema = z
  .object({
    path: z.string().min(1, "path is required."),
    autorename: z.boolean().default(false),
  })
  .strict();

export type CreateFolderConfig = z.infer<typeof CreateFolderConfigSchema>;
