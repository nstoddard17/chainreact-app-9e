import { z } from "zod";

/**
 * Resolved-config schema for the Notion `restore_page` action.
 *
 * Notion 2.1 Commit 1 — page lifecycle.
 *
 * Strict schema, single field. The action ONLY un-archives the named
 * page. It does not accept `archived` as a config field — the handler
 * hard-codes `archived: false`. Use `archive_page` for the inverse.
 *
 * Database items ARE pages in Notion's data model — this action works
 * on both bare pages and database rows.
 */
export const RestorePageConfigSchema = z
  .object({
    pageId: z.string().min(1, "pageId is required."),
  })
  .strict();

export type RestorePageConfig = z.infer<typeof RestorePageConfigSchema>;
