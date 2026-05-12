import { parseRecipients } from "@/core/integrations/parseRecipients";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { usersMessagesSend } from "../api/usersMessagesSend";
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
 * Output shape (Decision 2d-4 Option B): `{ id, threadId, to, subject }`.
 * `to` is echoed as the original caller-supplied value (string or
 * array) so existing downstream variable references stay stable. A
 * future Commit 3 expansion can switch to the parsed array if needed.
 */
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
        textBody: config.textBody,
        htmlBody: config.htmlBody,
        cc: ccAddresses.length > 0 ? ccAddresses.join(", ") : undefined,
        bcc: bccAddresses.length > 0 ? bccAddresses.join(", ") : undefined,
      });
      const rawMessage = encodeBase64Url(rfc5322);
      return usersMessagesSend({ accessToken, rawMessage });
    },
  });

  return {
    output: {
      id: result.id,
      threadId: result.threadId,
      to: config.to,
      subject: config.subject,
    },
  };
};
