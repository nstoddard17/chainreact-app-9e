import { z } from "zod";

/**
 * Resolved-config schema for the Google Drive search_files action
 * (Slice 4.GDRIVE-READ-2).
 *
 * Single-page, metadata-only name search. Builds a Drive `q` of
 * `name contains '<query>'` (title match only — NOT full-text content
 * search) optionally scoped to a folder, and returns one bounded page of
 * file metadata. No silent auto-pagination — a follow-up run passes
 * `pageToken` back to fetch the next page.
 *
 * `pageSize` is capped at 100 (lower than list_files' Drive-max 1000) — a
 * search is meant to be a focused lookup, not a bulk dump.
 *
 * Strict mode rejects unknown fields so V1-style `q`-passthrough configs
 * fail fast rather than silently widening the search surface.
 */
export const SearchFilesConfigSchema = z
  .object({
    query: z.string().min(1, "query is required."),
    /** Optional Drive folder id to scope the search to direct children. */
    folderId: z.string().optional(),
    pageSize: z.number().int().min(1).max(100).default(25),
    pageToken: z.string().optional(),
  })
  .strict();

export type SearchFilesConfig = z.infer<typeof SearchFilesConfigSchema>;
