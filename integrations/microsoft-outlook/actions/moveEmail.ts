import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { moveMessage } from "../api/moveMessage";
import { MoveEmailConfigSchema } from "./moveEmail.schema";

/**
 * Microsoft Outlook `POST /me/messages/{id}/move` action.
 *
 * Outlook Mail 2.2 Commit 2. Mirrors the 2.1 actions' shape:
 *   - Zod schema parse first.
 *   - Wrap principal call in `refreshAndRetry` (Q3): a 401 from Graph
 *     triggers exactly one refresh + retry; persistent 401 surfaces as
 *     IntegrationActionRequiredError.
 *
 * Scope: requires `Mail.ReadWrite` (P-O1). Without it Graph returns 403
 * ErrorAccessDenied and the standard error pipeline surfaces the message.
 *
 * Output shape (only load-bearing fields — no raw response spread):
 *   { moved: true, emailId, newId, destinationFolderId }
 *
 * `newId` is the new Graph message id assigned after the move (Outlook
 * re-keys on move). Workflows that chain `move_email` → further actions
 * on the same message reference `{{node.newId}}` rather than the original
 * `emailId` — moving via the original id would 404. `emailId` is echoed
 * for downstream summary refs.
 *
 * Account resolution mirrors 2.1 actions — when the trigger event came
 * from this provider, use its accountId; otherwise null and the
 * refreshAndRetry layer picks the user's single active integration row.
 */
export const moveEmail: ActionHandler = async (input) => {
  const config = MoveEmailConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-outlook"
      ? input.triggerEvent.providerAccountId
      : null;

  const moved = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-outlook",
    providerAccountId,
    apiCall: (accessToken) =>
      moveMessage({
        accessToken,
        messageId: config.emailId,
        destinationId: config.destinationFolderId,
      }),
  });

  return {
    output: {
      moved: true,
      emailId: config.emailId,
      newId: moved.id,
      destinationFolderId: config.destinationFolderId,
    },
  };
};
