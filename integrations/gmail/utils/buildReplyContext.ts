import type {
  GmailHeader,
  UsersMessagesGetResult,
} from "../api/usersMessagesGet";

/**
 * Derive the reply-context fields (`To` recipient, `Subject`,
 * `In-Reply-To`, `References`, `threadId`) from a Gmail message
 * fetched via `users.messages.get?format=metadata`.
 *
 * Shared between `create_draft_reply` and `reply_to_email` so the
 * threading semantics stay consistent between the draft and send
 * paths.
 *
 * V1 reference: `createDraftReply.ts:60-78`, `replyToEmail.ts:76-99`.
 *
 * V2-vs-V1 deltas:
 *   - `replyAll` is intentionally not derived here. V1's replyAll
 *     concatenated the original `To:` + `Cc:` headers verbatim into
 *     the new `Cc:` field, with NO dedupe and NO filtering of the
 *     authenticated user's own address (Gmail then deduped
 *     client-side and sometimes warned). That's not "clean V1 logic"
 *     by the parity bar in parity-gmail.md §7. Defer until a future
 *     slice ports an explicit replyAll design.
 *   - Custom subject override: when supplied non-empty, replaces the
 *     auto-generated "Re: " prefix entirely (matches V1
 *     replyToEmail.ts:86-92).
 *   - `inReplyTo` and `references` both carry the originating
 *     message's `Message-ID:` header. V1 set both to the same value
 *     (createDraftReply.ts:76-77). A full RFC 2822 References chain
 *     would concatenate the prior `References` header onto the new
 *     value, but format=metadata doesn't include that header by
 *     default and V1 didn't request it — preserve V1's shape.
 */
export interface ReplyContext {
  /** The address to address the reply To. */
  to: string;
  /** Either custom-supplied subject or auto "Re: <original>". */
  subject: string;
  /**
   * Originating `Message-ID:` header value (NOT Gmail's internal
   * `id`). Empty string when the original message has no Message-ID
   * header — caller may still proceed but threading degrades.
   */
  inReplyTo: string;
  /** Same as inReplyTo for this commit (see Q12-style V1 parity note above). */
  references: string;
  /** Gmail thread id from the original message. */
  threadId: string;
}

export function buildReplyContext(input: {
  original: UsersMessagesGetResult;
  customSubject?: string;
}): ReplyContext {
  const { original, customSubject } = input;
  const headers = original.payload.headers;

  const originalFrom = readHeader(headers, "From");
  const originalSubject = readHeader(headers, "Subject");
  const originalMessageId = readHeader(headers, "Message-ID");

  const trimmedCustom =
    customSubject !== undefined ? customSubject.trim() : "";
  const subject =
    trimmedCustom.length > 0
      ? trimmedCustom
      : originalSubject.startsWith("Re: ")
        ? originalSubject
        : `Re: ${originalSubject}`;

  return {
    to: originalFrom,
    subject,
    inReplyTo: originalMessageId,
    references: originalMessageId,
    threadId: original.threadId,
  };
}

function readHeader(headers: readonly GmailHeader[], name: string): string {
  for (const h of headers) {
    if (h.name.toLowerCase() === name.toLowerCase()) return h.value;
  }
  return "";
}
