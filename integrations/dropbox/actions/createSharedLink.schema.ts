import { z } from "zod";

/**
 * Resolved-config schema for `dropbox:create_shared_link` —
 * Slice 3.DROPBOX-2. Creates a shared link for `path`; reuses the
 * existing link on conflict (D-DB8).
 *
 * `folderPath` (optional, UI-scope — DROPBOX-4): NOT used by the handler.
 * Present so the persisted Builder config validates — the `dropbox:files`
 * file picker on `path` cascades from this folder field
 * (`dropbox:folders`). The handler ignores it; strict mode still rejects
 * genuinely unknown fields.
 */
export const CreateSharedLinkConfigSchema = z
  .object({
    path: z.string().min(1, "path is required."),
    folderPath: z.string().optional(),
  })
  .strict();

export type CreateSharedLinkConfig = z.infer<
  typeof CreateSharedLinkConfigSchema
>;
