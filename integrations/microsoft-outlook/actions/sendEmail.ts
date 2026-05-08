import type { ActionHandler } from "@/services/execution/handlers/types";
import { parseRecipients } from "@/core/integrations/parseRecipients";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { sendMail, type GraphRecipient } from "../api/sendMail";
import { SendEmailConfigSchema } from "./sendEmail.schema";

/**
 * Microsoft Outlook `me/sendMail` action handler.
 *
 * Mirrors Gmail's send_email shape:
 *   - Schema parse first (Zod strict; Q11 enforces explicit isHtml +
 *     importance).
 *   - parseRecipients on to/cc/bcc (Q7) — CSV strings split, arrays
 *     flatten, empties drop.
 *   - At-least-one-recipient invariant enforced AFTER parsing — the
 *     schema guarantees `to` has at least one non-empty entry, but
 *     post-trim it could still be empty whitespace ("   "); we re-check
 *     here so a "   ,  ," CSV produces a clean error rather than a
 *     Graph 400.
 *   - Wrap principal call in `refreshAndRetry` (Q3): a 401 from Graph
 *     triggers exactly one refresh + retry; persistent 401 surfaces as
 *     IntegrationActionRequiredError.
 *
 * Output shape:
 *   - `sent: true` on success (Graph returns 202 with no body, so there's
 *     no provider id to surface).
 *   - `to`, `cc`, `bcc`: flat parsed lists of addresses actually sent
 *     (downstream nodes can iterate, e.g. for a confirmation summary).
 *   - `subject`, `importance`, `isHtml` echoed for downstream variable refs.
 *
 * Account resolution mirrors Gmail / Sheets — when the trigger event came
 * from this provider, use its accountId; otherwise null and the
 * dispatcher picks the user's single active integration row.
 */
export const sendEmail: ActionHandler = async (input) => {
  const config = SendEmailConfigSchema.parse(input.config);

  // Q7 — split CSVs / flatten arrays / drop empties. Schema guaranteed
  // `to` is non-empty as a string-or-array, but a value like "  ,  " or
  // [""] still parses to []; recheck after parsing.
  const toAddresses = parseRecipients(config.to);
  const ccAddresses = parseRecipients(config.cc);
  const bccAddresses = parseRecipients(config.bcc);

  if (toAddresses.length === 0) {
    throw new Error(
      "send_email: at least one address in `to` is required (after parsing CSV / array).",
    );
  }

  const accountId =
    input.triggerEvent.provider === "microsoft-outlook"
      ? input.triggerEvent.accountId
      : null;

  const toGraph = (addresses: string[]): GraphRecipient[] =>
    addresses.map((address) => ({ emailAddress: { address } }));

  await refreshAndRetry({
    userId: input.userId,
    provider: "microsoft-outlook",
    accountId,
    apiCall: (accessToken) =>
      sendMail({
        accessToken,
        message: {
          subject: config.subject,
          body: {
            contentType: config.isHtml ? "HTML" : "Text",
            content: config.body,
          },
          toRecipients: toGraph(toAddresses),
          ccRecipients: ccAddresses.length > 0 ? toGraph(ccAddresses) : undefined,
          bccRecipients:
            bccAddresses.length > 0 ? toGraph(bccAddresses) : undefined,
          importance: config.importance,
        },
        // Match V1 default — saved copy in Sent Items. Workflow authors
        // who want fire-and-forget can override via a future schema field.
        saveToSentItems: true,
      }),
  });

  return {
    output: {
      sent: true,
      to: toAddresses,
      cc: ccAddresses,
      bcc: bccAddresses,
      subject: config.subject,
      isHtml: config.isHtml,
      importance: config.importance,
    },
  };
};
