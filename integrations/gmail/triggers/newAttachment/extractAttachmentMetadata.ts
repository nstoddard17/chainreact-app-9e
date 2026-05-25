import type {
  GmailMessagePart,
  UsersMessagesGetResult,
} from "../../api/usersMessagesGet";

/**
 * Per-attachment metadata for the Gmail new_attachment trigger.
 *
 * Gmail 2.3 Commit 4 — the trigger payload exposes one of these per
 * attachment found on a hydrated message. **No bytes / no FileRef at
 * trigger boundary** (Gmail 2.3 plan decision §13.2): workflow authors
 * who need bytes chain `gmail/get_attachment(messageId, attachmentId)`
 * downstream and get a FileRef from that action.
 */
export interface AttachmentMeta {
  /** Gmail attachment id, suitable for `users.messages.attachments.get`. */
  attachmentId: string;
  /** User-visible filename (never empty per the extraction rules below). */
  filename: string;
  /** Per-part MIME type. */
  mimeType: string;
  /** Bytes from `body.size` if reported; 0 when Gmail omits it. */
  sizeBytes: number;
}

/**
 * Walk the MIME tree under a `format=full` Gmail message payload and
 * collect attachment metadata.
 *
 * Inclusion rules (mirror V1 gmail-processor.ts but applied at the
 * trigger layer in V2):
 *   - `part.filename` must be non-empty (skips inline / unnamed parts).
 *   - `part.body.attachmentId` must exist (the id we'd need to fetch
 *     bytes downstream — a part without one isn't reachable via
 *     `users.messages.attachments.get`).
 *
 * Inline images (`Content-Disposition: inline` with no filename) are
 * filtered by the filename check. Nested multipart structures
 * (`multipart/mixed` → `multipart/alternative` → leaves) are walked
 * recursively.
 *
 * Pure / no side effects — unit-testable without mocks.
 */
export function extractAttachmentMetadata(
  message: UsersMessagesGetResult,
): AttachmentMeta[] {
  const out: AttachmentMeta[] = [];
  walk(message.payload.parts, out);
  return out;
}

function walk(
  parts: readonly GmailMessagePart[] | undefined,
  out: AttachmentMeta[],
): void {
  if (!parts) return;
  for (const part of parts) {
    if (
      part.filename &&
      part.filename.length > 0 &&
      part.body?.attachmentId
    ) {
      out.push({
        attachmentId: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType ?? "",
        sizeBytes: Number(part.body.size ?? 0),
      });
    }
    if (part.parts) walk(part.parts, out);
  }
}
