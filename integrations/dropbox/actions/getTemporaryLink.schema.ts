import { z } from "zod";

/**
 * Resolved-config schema for `dropbox:get_temporary_link` —
 * Slice 3.DROPBOX-2. Returns an auth-free ~4h download URL wrapped as a
 * FileRef(kind=signed_url).
 *
 * `folderPath` (optional, UI-scope — DROPBOX-4): NOT used by the handler.
 * Present so the persisted Builder config validates — the `dropbox:files`
 * file picker on `path` cascades from this folder field
 * (`dropbox:folders`). The handler ignores it; strict mode still rejects
 * genuinely unknown fields.
 */
export const GetTemporaryLinkConfigSchema = z
  .object({
    path: z.string().min(1, "path is required."),
    folderPath: z.string().optional(),
  })
  .strict();

export type GetTemporaryLinkConfig = z.infer<
  typeof GetTemporaryLinkConfigSchema
>;
