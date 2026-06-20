import { z } from "zod";

/**
 * Resolved-config schema for the Microsoft Outlook `list_folders` action
 * (Slice 4.OUTLOOK-READ-1).
 *
 * `GET /me/mailFolders` (top-level folders) takes no caller parameters in
 * this surface — the wrapper applies a fixed `$select=id,displayName` + page
 * cap. The config is therefore an empty object. `.strict()` rejects any
 * stray field so a paste-in config from another action fails fast.
 *
 * Read-only, metadata-only: returns folder id/displayName — never message
 * content, counts, bodies, or attachments.
 */
export const ListFoldersConfigSchema = z.object({}).strict();

export type ListFoldersConfig = z.infer<typeof ListFoldersConfigSchema>;
