import { z } from "zod";

/**
 * Resolved-config schema for the OneDrive upload_file action.
 *
 * Slice 8 Batch 1 surface — direct content/body upload only:
 *   - `filename`, `mimeType`, `content` are required.
 *   - `contentEncoding` defaults to "utf8" — set "base64" for binary
 *     content (PNG / PDF / etc.) decoded server-side before upload.
 *   - `parentItemId` optional — when unset / "root", file lands at the
 *     drive root.
 *
 * V1's multi-source upload (Supabase storage / FileStorageService /
 * URL fetch) is deliberately NOT ported. Workflow authors who need
 * binary content from another node pre-encode to base64 in an upstream
 * node. Mirrors V2 Google Drive `upload_file`.
 *
 * 4 MB cap is enforced at the API wrapper layer
 * (`driveItemsContentUpload`) — the schema can't cheaply introspect
 * the decoded size, and double-checking adds no value. The wrapper
 * throws a clear "exceeded 4 MB" error.
 *
 * Strict mode rejects unknown fields so leftovers from a paste-in
 * config (e.g. V1's `sourceType` / `uploadedFiles`) fail fast.
 */
export const UploadFileConfigSchema = z
  .object({
    filename: z.string().min(1, "filename is required."),
    mimeType: z.string().min(1, "mimeType is required."),
    content: z.string({ required_error: "content is required." }),
    contentEncoding: z.enum(["utf8", "base64"]).default("utf8"),
    /**
     * Drive root if omitted. Set to a folder DriveItem id to upload
     * into a specific folder. Slice 8 accepts `"root"` as an explicit
     * synonym for "no parent" (matches V1's UI sentinel) — the wrapper
     * routes both to /me/drive/root:/{filename}:/content.
     */
    parentItemId: z.string().optional(),
  })
  .strict();

export type UploadFileConfig = z.infer<typeof UploadFileConfigSchema>;
