import { z } from "zod";

/**
 * Resolved-config schema for the Google Drive create_folder action.
 *
 * Q11 — no hidden defaults. `parentFolderId` is optional (Drive defaults
 * to "My Drive" root when parents[] is unset); leaving it optional matches
 * Drive's own behavior and is genuinely a "no opinion" choice rather than
 * a hidden default. `name` is required.
 *
 * Schema is `.strict()` so unknown fields (e.g., a leftover `mimeType`
 * from a paste-in config) are rejected at parse time rather than silently
 * forwarded to Drive.
 */
export const CreateFolderConfigSchema = z
  .object({
    name: z.string().min(1, "name is required."),
    /**
     * Drive folder id. When unset, the new folder is created at My Drive
     * root. Pass the literal string "root" if you want to be explicit; the
     * handler treats both unset and "root" identically.
     */
    parentFolderId: z.string().optional(),
  })
  .strict();

export type CreateFolderConfig = z.infer<typeof CreateFolderConfigSchema>;
