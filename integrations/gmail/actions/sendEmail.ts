import { parseRecipients } from "@/core/integrations/parseRecipients";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { usersMessagesModify } from "../api/usersMessagesModify";
import { usersMessagesSend } from "../api/usersMessagesSend";
import { applySignature } from "../utils/applySignature";
import { buildRfc5322Message, encodeBase64Url } from "../utils/rfc5322";
import { SendEmailConfigSchema } from "./sendEmail.schema";

/**
 * Gmail `users.messages.send` action handler.
 *
 * First handler in V2 to use the `refreshAndRetry` wrapper. The wrapper
 * owns integration lookup, token decryption, and retry-on-401. The
 * handler hands over `{ userId, provider: "gmail", accountId, apiCall }`;
 * inside `apiCall` it builds the RFC 5322 message, base64url-encodes it,
 * and calls the Gmail API.
 *
 * Account resolution: when the workflow's trigger event came from Gmail,
 * the trigger event's accountId (the email address) targets the right
 * inbox. For non-Gmail triggers (manual / scheduled / different
 * provider) accountId is `null`, which lets `refreshAndRetry` pick the
 * single active Gmail integration for the user.
 *
 * Recipients — Gmail 2.1 / P-G2 (Q7): `to` / `cc` / `bcc` route through
 * `parseRecipients`, which splits CSVs, flattens arrays, trims, and
 * drops empties. Post-parse the handler re-checks that `to` is
 * non-empty (the schema's min(1) catches "" and []; whitespace-only
 * CSVs like "   ,  ," only fail after the trim step here).
 *
 * Gmail 2.1 Commit 2 expansion (parity-gmail.md §7):
 *   - `replyTo` → RFC 5322 `Reply-To:` header.
 *   - `signature` → appended to textBody ("\n\n<sig>") and / or
 *     htmlBody ("<br><br><sig>") whichever is present. textBody is
 *     never silently HTML-ified (matches V1 sendEmail.ts:161-165).
 *   - `labels` → after a successful `users.messages.send`, the handler
 *     calls `users.messages.modify` with `addLabelIds`. If the modify
 *     call fails after send succeeds, the handler **throws** rather
 *     than silently swallowing (V2 doesn't have an accepted
 *     partial-success ActionResult contract today). The thrown error
 *     names the sent message id so operators can correlate — see the
 *     `applyLabelsPostSend` helper below.
 *
 * Output shape (Decision 2d-4 Option B, extended): `{ id, threadId, to,
 * subject, labelIds }`. `to` is echoed as the original caller-supplied
 * value (string or array) so existing downstream variable references
 * stay stable. `labelIds` reflects the post-send state: the modify
 * response's `labelIds` when labels were applied; the send response's
 * `labelIds` (typically `["SENT"]`) when no labels were requested.
 */

class GmailLabelsOnSendError extends Error {
  readonly messageId: string;
  readonly threadId: string;
  readonly underlying: unknown;
  constructor(input: {
    messageId: string;
    threadId: string;
    underlying: unknown;
  }) {
    const underlyingMessage =
      input.underlying instanceof Error
        ? input.underlying.message
        : String(input.underlying);
    super(
      `send_email: email was sent (id=${input.messageId}) but post-send label application failed: ${underlyingMessage}`,
    );
    this.name = "GmailLabelsOnSendError";
    this.messageId = input.messageId;
    this.threadId = input.threadId;
    this.underlying = input.underlying;
  }
}

export const sendEmail: ActionHandler = async (input) => {
  const config = SendEmailConfigSchema.parse(input.config);

  // Q7 — normalize CSV strings + arrays into a flat trimmed list. The
  // schema's min(1) on `to` rejects "" and [], but a whitespace-only
  // CSV ("   ,  ,") still parses to []; re-check after parsing.
  const toAddresses = parseRecipients(config.to);
  const ccAddresses = parseRecipients(config.cc);
  const bccAddresses = parseRecipients(config.bcc);

  if (toAddresses.length === 0) {
    throw new Error(
      "send_email: at least one address in `to` is required (after parsing CSV / array).",
    );
  }

  // Gmail 2.1 Commit 2 — signature appended to each body field
  // individually using format-appropriate separators. No silent
  // HTML-ification of textBody (G-R6).
  const textBodyWithSig = applySignature(
    config.textBody,
    config.signature,
    /* isHtml */ false,
  );
  const htmlBodyWithSig = applySignature(
    config.htmlBody,
    config.signature,
    /* isHtml */ true,
  );

  const accountId =
    input.triggerEvent.provider === "gmail"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "gmail",
    accountId,
    apiCall: async (accessToken) => {
      const rfc5322 = buildRfc5322Message({
        to: toAddresses.join(", "),
        subject: config.subject,
        textBody: textBodyWithSig,
        htmlBody: htmlBodyWithSig,
        cc: ccAddresses.length > 0 ? ccAddresses.join(", ") : undefined,
        bcc: bccAddresses.length > 0 ? bccAddresses.join(", ") : undefined,
        replyTo: config.replyTo,
      });
      const rawMessage = encodeBase64Url(rfc5322);
      return usersMessagesSend({ accessToken, rawMessage });
    },
  });

  // Gmail 2.1 Commit 2 — labels-on-send. Wrapped in its own
  // refreshAndRetry so a token expiry between the send call and the
  // modify call still resolves to a single refresh. If the modify
  // fails (after a successful send), GmailLabelsOnSendError surfaces
  // the message id so operators can correlate — never silently
  // swallowed.
  let appliedLabelIds: readonly string[] | undefined = result.labelIds;
  if (config.labels !== undefined && config.labels.length > 0) {
    try {
      const modifyResult = await refreshAndRetry({
        userId: input.userId,
        provider: "gmail",
        accountId,
        apiCall: async (accessToken) =>
          usersMessagesModify({
            accessToken,
            messageId: result.id,
            addLabelIds: config.labels,
          }),
      });
      appliedLabelIds = modifyResult.labelIds ?? config.labels;
    } catch (err) {
      throw new GmailLabelsOnSendError({
        messageId: result.id,
        threadId: result.threadId,
        underlying: err,
      });
    }
  }

  return {
    output: {
      id: result.id,
      threadId: result.threadId,
      to: config.to,
      subject: config.subject,
      labelIds: appliedLabelIds,
    },
  };
};

// Exported for tests so they can assert against the error class via
// `expect(err).toBeInstanceOf(...)` rather than a brittle name string.
export { GmailLabelsOnSendError };
