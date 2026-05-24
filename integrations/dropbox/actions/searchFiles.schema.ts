import { z } from "zod";

/**
 * Resolved-config schema for `dropbox:search_files` — Slice 3.DROPBOX-2.
 * Searches `query`, optionally scoped to a folder `path`.
 */
export const SearchFilesConfigSchema = z
  .object({
    query: z.string().min(1, "query is required."),
    path: z.string().optional(),
    maxResults: z.number().int().positive().max(1000).optional(),
  })
  .strict();

export type SearchFilesConfig = z.infer<typeof SearchFilesConfigSchema>;
