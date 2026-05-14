import { z } from "zod";

/**
 * Resolved-config schema for the Notion `archive_page` action.
 *
 * Notion 2.1 Commit 1 — page lifecycle.
 *
 * Strict schema, single field. The action ONLY archives the named page.
 * It does not accept `archived` as a config field — the handler hard-codes
 * `archived: true` so workflow authors cannot accidentally un-archive
 * via this action. Use `restore_page` for the inverse.
 *
 * Database items ARE pages in Notion's data model — this action works
 * on both bare pages and database rows. The `pageId` regex is permissive
 * (matches Notion's UUID format) rather than provider-rejecting database
 * ids, because the underlying `PATCH /v1/pages/{id}` endpoint succeeds
 * for both shapes.
 */
export const ArchivePageConfigSchema = z
  .object({
    pageId: z.string().min(1, "pageId is required."),
  })
  .strict();

export type ArchivePageConfig = z.infer<typeof ArchivePageConfigSchema>;
