import { z } from "zod";

/**
 * Resolved-config schema for the Google Docs `new_document` trigger —
 * Slice 3.GDOCS-5.
 *
 * Fires when a new Google Docs document appears in the watched scope:
 *   - When `folderId` is set, only documents whose `parents` includes
 *     that folder are surfaced.
 *   - When `folderId` is omitted, ALL newly-created Google Docs across
 *     the user's drive surface (Drive's "root" watch).
 *
 * V2-native — Google Docs has no native trigger surface. This trigger
 * rides Drive's `files.watch` push channel against the user's whole
 * drive (or a specific folder when scoped) and filters the inbound
 * change stream to Google Docs mimeType + `created` change-kind in the
 * normalize step. The Drive transport already powers
 * `google-drive:file_changed`, `google-sheets:row_changed`, and
 * `google-sheets:new_worksheet` — no new infrastructure.
 *
 * Strict mode rejects unknown fields and V1 polling chrome.
 */
export const NewDocumentInputConfigSchema = z
  .object({
    /**
     * Optional Drive folder id to scope the watch. When omitted, the
     * trigger watches the user's whole drive (`fileId: "root"` on the
     * Drive files.watch call).
     */
    folderId: z.string().min(1).optional(),
  })
  .strict();

export type NewDocumentInputConfig = z.infer<
  typeof NewDocumentInputConfigSchema
>;
