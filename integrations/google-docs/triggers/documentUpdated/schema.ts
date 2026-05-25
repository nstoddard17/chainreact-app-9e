import { z } from "zod";

/**
 * Resolved-config schema for the Google Docs `document_updated`
 * trigger — Slice 3.GDOCS-5.
 *
 * Fires when an existing Google Docs document changes in the watched
 * scope. Filters apply in order:
 *   - `documentId` (when set) — only changes to this specific document
 *     surface. When the trigger watches the whole drive, this is the
 *     narrowest possible scoping.
 *   - `folderId` (when set) — only changes to Docs whose `parents`
 *     include this folder surface.
 *   - Both unset — every existing-Doc update across the user's drive
 *     surfaces.
 *
 * V2-native — rides Drive's `files.watch` push channel (the same
 * transport `google-drive:file_changed` /
 * `google-sheets:row_changed` / `google-sheets:new_worksheet` use).
 * Filtering to Docs mimeType + `updated` change-kind +
 * `documentId` / `folderId` happens in the normalize step.
 *
 * Strict mode rejects unknown fields and V1 polling chrome.
 */
export const DocumentUpdatedInputConfigSchema = z
  .object({
    /**
     * Optional — scope the trigger to a specific Google Docs document.
     * When set, the Drive watch is registered against this fileId
     * directly (Drive supports per-file watches), so the change stream
     * is naturally narrowed at the API layer.
     */
    documentId: z.string().min(1).optional(),
    /**
     * Optional — scope the trigger to a Drive folder. When set and
     * `documentId` is unset, the watch is registered against this
     * folder; `normalize` additionally filters by parent membership.
     */
    folderId: z.string().min(1).optional(),
  })
  .strict();

export type DocumentUpdatedInputConfig = z.infer<
  typeof DocumentUpdatedInputConfigSchema
>;
