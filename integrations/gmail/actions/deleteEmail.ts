import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { usersMessagesTrash } from "../api/usersMessagesTrash";
import { DeleteEmailConfigSchema } from "./deleteEmail.schema";

/**
 * Gmail `delete_email` — trash-only delete.
 *
 * `deleteMode` remains REQUIRED with no silent default (parity-gmail.md
 * decision 2), but `"trash"` is the only supported value:
 *   - `"trash"` → `usersMessagesTrash` (recoverable ~30d, then Gmail
 *     purges it). Authorized by `gmail.modify`.
 *   - `"permanent"` → REJECTED with a clear error
 *     (GOOGLE-OAUTH-REVIEW-READINESS-2). Google authorizes
 *     `users.messages.delete` only under `https://mail.google.com/`,
 *     which ChainReact does not request — this mode never succeeded in
 *     production. A legacy saved workflow that still carries it must
 *     fail loudly here, never silently degrade to trash: converting a
 *     permanent-delete step into a trash step would change the meaning
 *     of a destructive workflow behind the author's back.
 *
 * Output: `{ messageId, threadId, labelIds, deleteMode: "trash" }` —
 * Gmail returns the modified message with the TRASH label, so labelIds
 * reflects the new state.
 */
export const deleteEmail: ActionHandler = async (input) => {
  const config = DeleteEmailConfigSchema.parse(input.config);

  if (config.deleteMode === "permanent") {
    throw new Error(
      "Gmail 'Permanent delete' is no longer supported: Google only allows " +
        "permanent deletion under the full-mailbox mail.google.com scope, " +
        "which ChainReact does not request (this mode could never complete). " +
        "Edit this step and set Delete mode to 'Move to trash' — Gmail " +
        "purges trashed messages after about 30 days.",
    );
  }

  const providerAccountId =
    input.triggerEvent.provider === "gmail"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "gmail",
    providerAccountId,
    apiCall: async (accessToken) =>
      usersMessagesTrash({
        accessToken,
        messageId: config.messageId,
      }),
  });

  return {
    output: {
      messageId: result.id,
      threadId: result.threadId,
      labelIds: result.labelIds,
      deleteMode: "trash" as const,
    },
  };
};
