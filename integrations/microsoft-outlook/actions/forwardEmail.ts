import type { ActionHandler } from "@/services/execution/handlers/types";
import { parseRecipients } from "@/core/integrations/parseRecipients";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { forwardMessage } from "../api/forwardMessage";
import type { GraphRecipient } from "../api/sendMail";
import { ForwardEmailConfigSchema } from "./forwardEmail.schema";

/**
 * Microsoft Outlook `me/messages/{id}/forward` action.
 *
 * Outlook Mail 2.1 Commit 3. Mirrors `send_email`'s shape:
 *   - Schema parse first (Q7: `to` is required, `cc` optional, both
 *     accept CSV string OR array).
 *   - parseRecipients flattens CSVs / arrays into a flat string list.
 *     Closes V1 O-R3: V1 passed CSV strings verbatim to Graph, which
 *     treated them as ONE address.
 *   - At-least-one-recipient invariant enforced AFTER parsing — schema
 *     guarantees `to` is non-empty as a value, but post-parse it could
 *     still be empty (whitespace-only CSV like "   ,   ,   ").
 *   - Wrap principal call in `refreshAndRetry` (Q3).
 *   - Omit cc/comment from the Graph body when absent — matches Slice 6
 *     sendMail's "omit-when-empty" convention.
 *
 * Output shape (no provider response spread — Graph returns 202 No
 * Content):
 *   { forwarded: true, originalEmailId, to: string[], cc: string[] }
 *
 * The parsed recipient arrays are echoed in the output so downstream
 * nodes can iterate (e.g. for a confirmation summary). `cc` is the
 * parsed string array — empty `[]` when the workflow didn't pass `cc`
 * (handler's choice; gives downstream a stable shape).
 */
export const forwardEmail: ActionHandler = async (input) => {
  const config = ForwardEmailConfigSchema.parse(input.config);

  // Q7 — split CSVs / flatten arrays / drop empties. The schema's
  // `.min(1)` on `to` only catches "no value at all"; "   ,  " still
  // parses to [] post-parseRecipients, so re-check here.
  const toAddresses = parseRecipients(config.to);
  const ccAddresses = parseRecipients(config.cc);

  if (toAddresses.length === 0) {
    throw new Error(
      "forward_email: at least one address in `to` is required (after parsing CSV / array).",
    );
  }

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-outlook"
      ? input.triggerEvent.providerAccountId
      : null;

  const toGraph = (addresses: string[]): GraphRecipient[] =>
    addresses.map((address) => ({ emailAddress: { address } }));

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-outlook",
    providerAccountId,
    apiCall: (accessToken) =>
      forwardMessage({
        accessToken,
        messageId: config.emailId,
        toRecipients: toGraph(toAddresses),
        // Only include ccRecipients when the parsed list is non-empty.
        // The wrapper additionally drops the field from the JSON body
        // when undefined, but spreading at the call site keeps the
        // observable shape clean for tests and matches the `comment`
        // omit-when-absent pattern below.
        ...(ccAddresses.length > 0 && {
          ccRecipients: toGraph(ccAddresses),
        }),
        // Pass `comment` only when the workflow author supplied it.
        // V1 hard-defaulted to empty string; V2 lets absent stay absent.
        ...(config.comment !== undefined && { comment: config.comment }),
      }),
  });

  return {
    output: {
      forwarded: true,
      originalEmailId: config.emailId,
      to: toAddresses,
      cc: ccAddresses,
    },
  };
};
