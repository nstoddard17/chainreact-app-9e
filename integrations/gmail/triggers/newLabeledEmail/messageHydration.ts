import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  GmailHeader,
  UsersMessagesGetResult,
} from "../../api/usersMessagesGet";

/**
 * Build the canonical TriggerEvent for the Gmail new_labeled_email
 * trigger.
 *
 * Gmail 2.3 Commit 3 — mirrors newEmail/messageHydration.ts and adds
 * two label-specific payload fields:
 *
 *   - `labelAppliedId` — echoes the workflow's configured label
 *     (the label whose application fired this trigger). Workflow
 *     authors who configure multiple new_labeled_email triggers
 *     reading the same Gmail account get an unambiguous reference
 *     to which trigger this event belongs to.
 *   - `labelsAdded` — the FULL list of labels added in the
 *     originating Gmail history entry (NOT the message's current
 *     labelIds). When Gmail applies multiple labels at once (e.g.
 *     "INBOX" + "Label_5" in one history event), workflow authors
 *     can branch on the rest via this field.
 *
 * `eventType` is `"new_labeled_email"` so downstream dispatch /
 * filtering can distinguish this from `new_email` even though the
 * underlying Gmail message is the same.
 *
 * `eventId` uses a `labeled:` prefix matching the dedup-key scheme
 * — keeping the same Gmail message id distinguishable across
 * trigger types at the dispatch layer too.
 */

export function buildLabeledTriggerEvent(input: {
  emailAddress: string;
  message: UsersMessagesGetResult;
  labelAppliedId: string;
  labelsAdded: readonly string[];
}): TriggerEvent {
  const { message, emailAddress, labelAppliedId, labelsAdded } = input;
  const headers = message.payload.headers;
  const internalMs = Number(message.internalDate);
  const occurredAt = Number.isFinite(internalMs)
    ? new Date(internalMs).toISOString()
    : new Date().toISOString();

  return {
    provider: "gmail",
    eventType: "new_labeled_email",
    eventId: `labeled:${message.id}`,
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
      // Label-specific fields:
      labelAppliedId,
      labelsAdded,
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
