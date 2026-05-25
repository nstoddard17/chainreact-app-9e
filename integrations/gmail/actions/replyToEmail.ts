import { parseRecipients } from "@/core/integrations/parseRecipients";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { usersMessagesGet } from "../api/usersMessagesGet";
import { usersMessagesSend } from "../api/usersMessagesSend";
import { applySignature } from "../utils/applySignature";
import { buildReplyContext } from "../utils/buildReplyContext";
import { buildRfc5322Message, encodeBase64Url } from "../utils/rfc5322";
import { ReplyToEmailConfigSchema } from "./replyToEmail.schema";

/**
 * Gmail `users.messages.send` (threaded) action handler — send a
 * reply to an existing email.
 *
 * Mirrors `create_draft_reply` end-to-end except the terminal API
 * call:
 *   - `create_draft_reply` → `users.drafts.create` with `message.
 *     threadId` (draft surfaces in conversation, NOT sent yet).
 *   - `reply_to_email` → `users.messages.send` with `threadId` in the
 *     request body (message sent immediately, threaded in original
 *     conversation).
 *
 * Output aligns with `send_email`: `{ id, threadId, labelIds }` plus
 * `replyingTo` so downstream nodes can correlate. **No `labels`
 * field in this commit** — labels-on-send was a `send_email` Commit 2
 * concern; if workflow authors want to label a reply they call
 * `add_label` (Gmail 2.2) against the resulting message id.
 *
 * Original-message lookup is wrapped in its own `refreshAndRetry`;
 * the send call is wrapped in another. Token expiry between the two
 * resolves with a single refresh.
 */
export const replyToEmail: ActionHandler = async (input) => {
  const config = ReplyToEmailConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "gmail"
      ? input.triggerEvent.accountId
      : null;

  // Step 1 — lookup original message metadata for headers + threadId.
  const original = await refreshAndRetry({
    userId: input.userId,
    provider: "gmail",
    accountId,
    apiCall: async (accessToken) =>
      usersMessagesGet({
        accessToken,
        messageId: config.originalMessageId,
      }),
  });

  const replyCtx = buildReplyContext({
    original,
    customSubject: config.subject,
  });

  // Step 2 — Q7 normalize the user-supplied additional cc/bcc.
  const ccAddresses = parseRecipients(config.cc);
  const bccAddresses = parseRecipients(config.bcc);

  // Step 3 — apply signature to whichever bodies are present.
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

  // Step 4 — build reply MIME + send in the original thread.
  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "gmail",
    accountId,
    apiCall: async (accessToken) => {
      const rfc5322 = buildRfc5322Message({
        to: replyCtx.to,
        subject: replyCtx.subject,
        textBody: textBodyWithSig,
        htmlBody: htmlBodyWithSig,
        cc: ccAddresses.length > 0 ? ccAddresses.join(", ") : undefined,
        bcc: bccAddresses.length > 0 ? bccAddresses.join(", ") : undefined,
        replyTo: config.replyTo,
        inReplyTo: replyCtx.inReplyTo,
        references: replyCtx.references,
      });
      const rawMessage = encodeBase64Url(rfc5322);
      return usersMessagesSend({
        accessToken,
        rawMessage,
        threadId: replyCtx.threadId,
      });
    },
  });

  return {
    output: {
      id: result.id,
      threadId: result.threadId,
      labelIds: result.labelIds,
      replyingTo: config.originalMessageId,
      subject: replyCtx.subject,
    },
  };
};
