import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { replyMessage } from "../api/replyMessage";
import { ReplyToEmailConfigSchema } from "./replyToEmail.schema";

/**
 * Microsoft Outlook `me/messages/{id}/reply` and `/replyAll` action.
 *
 * Outlook Mail 2.1 Commit 3. Mirrors `send_email`'s shape:
 *   - Zod schema parse first (Q11: `replyAll` is REQUIRED — no default).
 *   - Wrap principal call in `refreshAndRetry` (Q3): a 401 from Graph
 *     triggers exactly one refresh + retry; persistent 401 surfaces as
 *     IntegrationActionRequiredError.
 *   - Wrapper picks `/reply` vs `/replyAll` from the boolean — handler
 *     just passes through.
 *
 * Output shape (no provider response spread — Graph returns 202 No
 * Content; nothing to project beyond the boolean choice and the
 * original message id for downstream variable refs):
 *   { replied: true, replyAll: boolean, originalEmailId: string }
 *
 * Account resolution mirrors send_email — when the trigger event came
 * from this provider, use its accountId; otherwise null and the
 * refreshAndRetry layer picks the user's single active integration row.
 */
export const replyToEmail: ActionHandler = async (input) => {
  const config = ReplyToEmailConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-outlook"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-outlook",
    providerAccountId,
    apiCall: (accessToken) =>
      replyMessage({
        accessToken,
        messageId: config.emailId,
        comment: config.body,
        replyAll: config.replyAll,
      }),
  });

  return {
    output: {
      replied: true,
      replyAll: config.replyAll,
      originalEmailId: config.emailId,
    },
  };
};
