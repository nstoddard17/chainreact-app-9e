import { z } from "zod";

/**
 * Resolved-config schema for `dropbox:list_folder` — Slice 3.DROPBOX-2.
 * `path` root is the empty string. `cursor` paginates a prior call
 * (`path`/`recursive`/`limit` are ignored by Dropbox when continuing).
 */
export const ListFolderConfigSchema = z
  .object({
    path: z.string().default(""),
    recursive: z.boolean().default(false),
    limit: z.number().int().positive().max(2000).optional(),
    cursor: z.string().min(1).optional(),
  })
  .strict();

export type ListFolderConfig = z.infer<typeof ListFolderConfigSchema>;
