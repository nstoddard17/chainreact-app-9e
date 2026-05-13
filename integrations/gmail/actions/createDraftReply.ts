import { parseRecipients } from "@/core/integrations/parseRecipients";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { usersDraftsCreate } from "../api/usersDraftsCreate";
import { usersMessagesGet } from "../api/usersMessagesGet";
import { applySignature } from "../utils/applySignature";
import { buildReplyContext } from "../utils/buildReplyContext";
import { buildRfc5322Message, encodeBase64Url } from "../utils/rfc5322";
import { CreateDraftReplyConfigSchema } from "./createDraftReply.schema";

/**
 * Gmail `users.drafts.create` (threaded) action handler — create a
 * draft REPLY to an existing message.
 *
 * Flow:
 *   1. Fetch the original message via `users.messages.get?format=
 *      metadata` to derive From / Subject / Message-ID / threadId.
 *   2. Build the reply context (To = originalFrom, Subject = "Re: ..."
 *      or custom override, In-Reply-To = References = original
 *      Message-ID, threadId = original threadId).
 *   3. Build RFC 5322 MIME with reply headers + signature appended to
 *      whichever body fields are present.
 *   4. POST to `users.drafts.create` with `{ message: { raw,
 *      threadId } }` so the draft surfaces in the correct conversation.
 *
 * Both API calls are wrapped in their own `refreshAndRetry` so a token
 * expiry between the lookup and the draft-create still resolves with
 * a single refresh. If the original-message lookup fails, the handler
 * fails fast — V2 doesn't fall back to a caller-supplied threadId
 * (V1 did, see V1 createDraftReply.ts:63; that fallback let workflows
 * send drafts to a wrong thread when the caller passed a bad
 * threadId).
 *
 * Output: `{ draftId, messageId, threadId, replyingTo, subject }`.
 * `replyingTo` echoes the original message id for downstream nodes
 * that want to correlate the draft with its source.
 */
export const createDraftReply: ActionHandler = async (input) => {
  const config = CreateDraftReplyConfigSchema.parse(input.config);

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

  // Step 4 — build reply MIME + create the draft in the original thread.
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
      return usersDraftsCreate({
        accessToken,
        rawMessage,
        threadId: replyCtx.threadId,
      });
    },
  });

  return {
    output: {
      draftId: result.id,
      messageId: result.message.id,
      threadId: result.message.threadId,
      replyingTo: config.originalMessageId,
      subject: replyCtx.subject,
    },
  };
};
