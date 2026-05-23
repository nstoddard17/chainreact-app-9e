import { z } from "zod";

/**
 * Resolved-config schema for the Google Docs `create_document` action —
 * Slice 3.GDOCS-2.
 *
 * GDOCS-1 §3.1 + §4.1 — V2 v1 surface:
 *   - `title` REQUIRED — workflow-author-supplied document title.
 *   - `content` OPTIONAL — initial body content. Workflows that create
 *     an empty doc and fill it later via `update_document` may omit.
 *     V1's `contentSource: "file_upload"` mode is DEFERRED (D-GD1) —
 *     V2 v1 ships manual content only; the `contentSource` /
 *     `uploadedFile` fields are dropped entirely.
 *   - `folderId` OPTIONAL — Drive folder to place the document in.
 *     When unset, the document lands in My Drive root (Drive's
 *     default).
 *
 * V1's sharing fields (`enableSharing`, `shareType`, `emails`,
 * `permission`, `sendNotification`, `emailMessage`, `allowDownload`,
 * `expirationDate`) are MOVED OUT of `create_document` per GDOCS-1
 * §3.1 — they belong on `share_document`. Workflow authors who want
 * "create then share" chain two actions.
 *
 * Strict mode rejects unknown fields so accidental leftovers from a
 * paste-in V1 config (e.g. `contentSource`, `enableSharing`) fail
 * fast.
 *
 * Field names preserve V1 camelCase verbatim per GDOCS-1 §8.1 — no
 * normalization.
 */
export const CreateDocumentConfigSchema = z
  .object({
    title: z
      .string({ required_error: "title is required." })
      .min(1, "title is required."),
    content: z.string().default(""),
    folderId: z.string().min(1).optional(),
  })
  .strict();

export type CreateDocumentConfig = z.infer<typeof CreateDocumentConfigSchema>;
