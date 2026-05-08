import { z } from "zod";

/**
 * Resolved-config schema for the Google Drive upload_file action.
 *
 * Slice 4 Batch 1 surface — direct content/body upload only:
 *   - `filename`, `mimeType`, `content` are required.
 *   - `contentEncoding` defaults to "utf8" — set "base64" for binary
 *     content (PNG / PDF / etc.) decoded server-side before upload.
 *   - `parentFolderId` optional — when unset, file lands at My Drive root.
 *
 * V1's multi-source upload (URL fetch / piped buffer / runtime resolver)
 * is deliberately NOT ported. Workflow authors who need binary content
 * pre-encode to base64 in an upstream node.
 *
 * 25 MB cap is enforced at the API wrapper layer (filesCreateMultipart) —
 * the schema can't introspect the decoded size cheaply, and double-checking
 * adds no value. The wrapper throws a clear "exceeded 25MB" error.
 *
 * Strict mode rejects unknown fields so accidental leftovers from a paste-in
 * config (e.g., V1's `sourceType`) fail fast.
 */
export const UploadFileConfigSchema = z
  .object({
    filename: z.string().min(1, "filename is required."),
    mimeType: z.string().min(1, "mimeType is required."),
    content: z.string({ required_error: "content is required." }),
    contentEncoding: z.enum(["utf8", "base64"]).default("utf8"),
    parentFolderId: z.string().optional(),
  })
  .strict();

export type UploadFileConfig = z.infer<typeof UploadFileConfigSchema>;
