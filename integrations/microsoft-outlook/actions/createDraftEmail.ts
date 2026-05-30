import type { ActionHandler } from "@/services/execution/handlers/types";
import { parseRecipients } from "@/core/integrations/parseRecipients";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { createMessage } from "../api/createMessage";
import type { GraphRecipient } from "../api/sendMail";
import { CreateDraftEmailConfigSchema } from "./createDraftEmail.schema";

/**
 * Microsoft Outlook `POST /me/messages` (create draft) action.
 *
 * Outlook Mail 2.1 Commit 3. Mirrors `send_email`'s shape exactly minus
 * the send semantics — POST /me/messages creates a draft (returns 201
 * with the draft envelope) vs POST /me/sendMail dispatches (202 No
 * Content).
 *
 * Q-contracts:
 *   - Q11 `isHtml` + `importance` required at the schema layer.
 *   - Q7 `to`/`cc`/`bcc` routed through parseRecipients with at-least-
 *     one parsed `to` recipient enforced post-parse.
 *   - Q3 `refreshAndRetry` wraps the principal POST call.
 *
 * Scope: requires `Mail.ReadWrite` (P-O1 manifest widening). Without
 * it Graph returns 403 ErrorAccessDenied and refreshAndRetry surfaces
 * the message via the standard error pipeline.
 *
 * Output shape (only the load-bearing fields — no raw response spread):
 *   { draftId, subject, webLink, createdAt, to, cc, bcc }
 *
 * `draftId` is the most important field — downstream actions commonly
 * reference it via `{{nodeId.draftId}}` to send the draft later or
 * attach to it. `webLink` lets workflow authors surface a "view draft
 * in Outlook" URL in notifications.
 */
export const createDraftEmail: ActionHandler = async (input) => {
  const config = CreateDraftEmailConfigSchema.parse(input.config);

  // Q7 — split CSVs / flatten arrays / drop empties.
  const toAddresses = parseRecipients(config.to);
  const ccAddresses = parseRecipients(config.cc);
  const bccAddresses = parseRecipients(config.bcc);

  if (toAddresses.length === 0) {
    throw new Error(
      "create_draft_email: at least one address in `to` is required (after parsing CSV / array).",
    );
  }

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-outlook"
      ? input.triggerEvent.providerAccountId
      : null;

  const toGraph = (addresses: string[]): GraphRecipient[] =>
    addresses.map((address) => ({ emailAddress: { address } }));

  const draft = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-outlook",
    providerAccountId,
    apiCall: (accessToken) =>
      createMessage({
        accessToken,
        message: {
          subject: config.subject,
          body: {
            contentType: config.isHtml ? "HTML" : "Text",
            content: config.body,
          },
          toRecipients: toGraph(toAddresses),
          ccRecipients:
            ccAddresses.length > 0 ? toGraph(ccAddresses) : undefined,
          bccRecipients:
            bccAddresses.length > 0 ? toGraph(bccAddresses) : undefined,
          importance: config.importance,
        },
      }),
  });

  return {
    output: {
      draftId: draft.id,
      subject: draft.subject ?? config.subject,
      webLink: draft.webLink ?? null,
      createdAt: draft.createdDateTime ?? null,
      to: toAddresses,
      cc: ccAddresses,
      bcc: bccAddresses,
    },
  };
};
