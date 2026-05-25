import { z } from "zod";

/**
 * Resolved-config schema for the Google Drive list_files action.
 *
 * Slice 4 Batch 1 — narrowed query model. V1's full Drive query syntax
 * (`q` passthrough with mimeType/starred/sharedWithMe filters) is deferred.
 * Workflow authors filter post-list in a downstream node.
 *
 * Defaults that ARE NOT hidden (Q11):
 *   - `pageSize` defaults to 100 (Drive's own default; documented).
 *   - `includeTrashed` defaults to false because including trashed items
 *     would surprise authors composing a "what's in this folder" check.
 *     Both are surfaced as schema defaults, not silent backend coercions.
 */
export const ListFilesConfigSchema = z
  .object({
    /**
     * Drive folder id. When unset, lists across My Drive (no parent
     * filter). Pass `"root"` to explicitly target the root folder.
     */
    folderId: z.string().optional(),
    pageSize: z.number().int().min(1).max(1000).default(100),
    pageToken: z.string().optional(),
    includeTrashed: z.boolean().default(false),
  })
  .strict();

export type ListFilesConfig = z.infer<typeof ListFilesConfigSchema>;
