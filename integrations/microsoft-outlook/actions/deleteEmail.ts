import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { deleteMessage } from "../api/deleteMessage";
import { moveMessage } from "../api/moveMessage";
import { DeleteEmailConfigSchema } from "./deleteEmail.schema";

/**
 * Microsoft Outlook delete_email action.
 *
 * Outlook Mail 2.2 Commit 2. Two-mode action gated by REQUIRED Q11
 * `deleteMode` enum:
 *   - `"trash"` → moveMessage(destinationId: "deleteditems"). Reversible.
 *   - `"permanent"` → deleteMessage. Irreversible.
 *
 * Both modes wrap the principal Graph call in `refreshAndRetry` (Q3):
 * the mode branch happens INSIDE refreshAndRetry's apiCall, so a 401
 * triggers exactly one refresh + retry for whichever endpoint mode
 * selected. Two distinct apiCalls never fire per handler invocation.
 *
 * Scope: requires `Mail.ReadWrite` (P-O1).
 *
 * Output shape (stable across both modes):
 *   { deleted: true, emailId, mode: "trash" | "permanent" }
 *
 * Note: V1's output used `permanent: boolean`. V2 swaps to `mode: enum`
 * for symmetry with the input field name. Downstream variable refs to
 * `{{node.permanent}}` from V1 workflows need migration (out of scope).
 *
 * Account resolution mirrors 2.1 actions.
 */
export const deleteEmail: ActionHandler = async (input) => {
  const config = DeleteEmailConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-outlook"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-outlook",
    providerAccountId,
    apiCall: async (accessToken) => {
      if (config.deleteMode === "permanent") {
        await deleteMessage({
          accessToken,
          messageId: config.emailId,
        });
        return;
      }
      // "trash" — move to the well-known Deleted Items folder. The
      // moveMessage call returns the moved-message envelope; we don't
      // need its fields for delete_email's output shape (the message
      // is no longer in its original folder by user intent).
      await moveMessage({
        accessToken,
        messageId: config.emailId,
        destinationId: "deleteditems",
      });
    },
  });

  return {
    output: {
      deleted: true,
      emailId: config.emailId,
      mode: config.deleteMode,
    },
  };
};
