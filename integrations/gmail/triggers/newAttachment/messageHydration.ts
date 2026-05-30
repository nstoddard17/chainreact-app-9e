import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  GmailHeader,
  UsersMessagesGetResult,
} from "../../api/usersMessagesGet";
import type { AttachmentMeta } from "./extractAttachmentMetadata";

/**
 * Build the canonical TriggerEvent for the Gmail new_attachment trigger.
 *
 * Gmail 2.3 Commit 4 — mirrors newEmail/messageHydration.ts but:
 *
 *   - Adds `attachments` (per-attachment metadata array) and
 *     `attachmentCount` (length convenience for downstream branching).
 *   - Both fields are METADATA-ONLY per Gmail 2.3 plan decision §13.2:
 *     NO `data` / `base64` / `bytes` / `content` / `FileRef`. Workflow
 *     authors who need bytes chain `gmail/get_attachment(messageId,
 *     attachmentId)` downstream and get the FileRef from that action.
 *
 * `eventType` is `"new_attachment"` so downstream dispatch can
 * distinguish this from `new_email` even when the underlying Gmail
 * message is the same.
 *
 * `eventId` uses an `attachment:` prefix matching the dedup-key scheme
 * (see `./dedup.ts`) so the same message id stays distinguishable
 * across trigger types at the dispatch layer too.
 *
 * Header headerValue + `looksAttached` are intentionally duplicated
 * from newEmail/messageHydration.ts (same approach as
 * newLabeledEmail/messageHydration.ts) — pure, self-contained,
 * trigger-scoped utilities. Sharing them would couple unrelated
 * trigger code paths.
 */

export function buildAttachmentTriggerEvent(input: {
  emailAddress: string;
  message: UsersMessagesGetResult;
  attachments: readonly AttachmentMeta[];
}): TriggerEvent {
  const { message, emailAddress, attachments } = input;
  const headers = message.payload.headers;
  const internalMs = Number(message.internalDate);
  const occurredAt = Number.isFinite(internalMs)
    ? new Date(internalMs).toISOString()
    : new Date().toISOString();

  return {
    provider: "gmail",
    eventType: "new_attachment",
    eventId: `attachment:${message.id}`,
    occurredAt,
    providerAccountId: emailAddress,
    payload: {
      id: message.id,
      threadId: message.threadId,
      labelIds: message.labelIds,
      snippet: message.snippet,
      sizeEstimate: message.sizeEstimate,
      mimeType: message.payload.mimeType,
      hasAttachments: looksAttached(message.payload.mimeType),
      from: headerValue(headers, "From"),
      to: headerValue(headers, "To"),
      cc: headerValue(headers, "Cc"),
      bcc: headerValue(headers, "Bcc"),
      subject: headerValue(headers, "Subject"),
      date: headerValue(headers, "Date"),
      messageId: headerValue(headers, "Message-ID"),
      deliveredTo: headerValue(headers, "Delivered-To"),
      receivedAt: occurredAt,
      // Attachment-specific fields:
      attachments,
      attachmentCount: attachments.length,
    },
  };
}

function headerValue(
  headers: readonly GmailHeader[],
  name: string,
): string {
  for (const h of headers) {
    if (h.name.toLowerCase() === name.toLowerCase()) return h.value;
  }
  return "";
}

function looksAttached(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith("multipart/mixed");
}
