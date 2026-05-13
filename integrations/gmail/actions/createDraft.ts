import { parseRecipients } from "@/core/integrations/parseRecipients";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { usersDraftsCreate } from "../api/usersDraftsCreate";
import { applySignature } from "../utils/applySignature";
import { buildRfc5322Message, encodeBase64Url } from "../utils/rfc5322";
import { CreateDraftConfigSchema } from "./createDraft.schema";

/**
 * Gmail `users.drafts.create` action handler — create a brand-new
 * draft email (no thread context).
 *
 * Mirrors `send_email`'s shape (Gmail 2.1 Commit 2) end-to-end with
 * three deltas:
 *   - Calls `usersDraftsCreate` instead of `usersMessagesSend`. No
 *     post-send `users.messages.modify` (drafts don't take labels in
 *     this commit — see schema comment).
 *   - Output exposes `draftId` AND the underlying `messageId` /
 *     `threadId` that Gmail assigns to the draft. Workflow authors
 *     can chain a later action against the draft message id (e.g. a
 *     scheduled-send drafts.send when that lands).
 *   - No `labels` field, so no labels-on-send path.
 *
 * Account resolution + parseRecipients + signature appending + RFC
 * 5322 build + refreshAndRetry are identical to `send_email`. Any
 * change to those shared semantics applies to both handlers.
 */
export const createDraft: ActionHandler = async (input) => {
  const config = CreateDraftConfigSchema.parse(input.config);

  // Q7 — normalize CSV strings + arrays into a flat trimmed list. The
  // schema's min(1) on `to` rejects "" and [], but a whitespace-only
  // CSV ("   ,  ,") still parses to []; re-check after parsing.
  const toAddresses = parseRecipients(config.to);
  const ccAddresses = parseRecipients(config.cc);
  const bccAddresses = parseRecipients(config.bcc);

  if (toAddresses.length === 0) {
    throw new Error(
      "create_draft: at least one address in `to` is required (after parsing CSV / array).",
    );
  }

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
      return usersDraftsCreate({ accessToken, rawMessage });
    },
  });

  return {
    output: {
      draftId: result.id,
      messageId: result.message.id,
      threadId: result.message.threadId,
      to: config.to,
      subject: config.subject,
    },
  };
};
