import { z } from "zod";

/**
 * Resolved-config schema for the Google Drive delete_file action.
 *
 * Q11 — `permanent` is REQUIRED, no hidden default. Workflow authors
 * choose explicitly between trash (recoverable) and permanent delete
 * (not recoverable). V1 had a silent default to "trash" which surprised
 * authors expecting a hard delete; V2 forces the choice.
 *
 * Wire mapping:
 *   - `permanent: true`  → DELETE /drive/v3/files/{id}
 *   - `permanent: false` → PATCH /drive/v3/files/{id}  body { trashed: true }
 *
 * `fileId` required, no default, strict mode rejects unknown fields.
 */
export const DeleteFileConfigSchema = z
  .object({
    fileId: z.string().min(1, "fileId is required."),
    /**
     * Required (Q11). When true, the file is permanently destroyed and
     * cannot be recovered from Drive trash.
     */
    permanent: z.boolean(),
  })
  .strict();

export type DeleteFileConfig = z.infer<typeof DeleteFileConfigSchema>;
