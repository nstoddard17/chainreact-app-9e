import { z } from "zod";

/**
 * Resolved-config schema for the Gmail `get_attachment` action.
 *
 * Gmail 2.3 Commit 5 — single-attachment-per-action surface, output
 * is a P-S3 `FileRef(kind=v2_storage, provider="gmail")`. Per Gmail
 * 2.3 plan §7 + §11 V1 rot table (R8 / G-R5):
 *
 *   - `messageId` (required) — the Gmail message that carries the
 *     attachment. Comes from the `new_attachment` trigger payload or
 *     an upstream search/search_emails step.
 *   - `attachmentId` (required) — the Gmail attachment id from the
 *     same source. The handler fetches `users.messages.get?
 *     format=full` to locate the attachment metadata (filename,
 *     mimeType, sizeBytes) and confirm it exists BEFORE issuing the
 *     more expensive byte fetch.
 *   - `.strict()` — any stale workflow definition that carried V1
 *     fields fails at parse time rather than smuggling them into the
 *     handler.
 *
 * V1 fields intentionally rejected:
 *   - `attachmentSelection` — V1 enum (all/byName/byMime/…) that
 *     conflated "fetch this attachment" with "loop over attachments
 *     and dispatch". V2 takes one attachment per action; chain steps
 *     or loop nodes for multi.
 *   - `saveToVariable` — V1's hidden "skip the upload, just return
 *     base64 in the variable" flag. V2 always stages bytes to v2
 *     storage and returns a FileRef.
 *   - `storageService` / `folderId` — V1's "also push to Drive /
 *     OneDrive / Dropbox" cross-provider routing. V2 splits that
 *     into composition: `gmail/get_attachment → drive/upload_file`.
 *   - `data` / `content` / `base64` — V1's "supply your own bytes"
 *     compound action footprint. P-S3 contract rejects inline bytes
 *     at the FileRef boundary; the schema rejects them at the input
 *     boundary for symmetry and a clearer parse error.
 *   - `fileName` / `mimeType` — derived from Gmail message metadata,
 *     not workflow-author config. Allowing overrides would diverge
 *     the staged file's identity from the provider's.
 *
 * Scope requirement: `gmail.readonly` (already shipped in Slice 2 —
 * see Gmail 2.3 plan §10 scope analysis).
 */
export const GetAttachmentConfigSchema = z
  .object({
    messageId: z.string().min(1, "messageId is required."),
    attachmentId: z.string().min(1, "attachmentId is required."),
  })
  .strict();

export type GetAttachmentConfig = z.infer<typeof GetAttachmentConfigSchema>;
