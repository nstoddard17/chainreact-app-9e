import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { usersMessagesDelete } from "../api/usersMessagesDelete";
import { usersMessagesTrash } from "../api/usersMessagesTrash";
import { DeleteEmailConfigSchema } from "./deleteEmail.schema";

/**
 * Gmail `delete_email` — explicit-mode delete.
 *
 * Per parity-gmail.md decision 2: requires `deleteMode: "trash" |
 * "permanent"`. No silent default. The handler dispatches:
 *   - `"trash"`     → `usersMessagesTrash`   (recoverable 30d)
 *   - `"permanent"` → `usersMessagesDelete`  (irreversible)
 *
 * Output is mode-aware:
 *   - `trash`: `{ messageId, threadId, deleteMode: "trash",
 *     labelIds }` — Gmail returns the modified message with the
 *     TRASH label, so labelIds reflects the new state.
 *   - `permanent`: `{ messageId, deleteMode: "permanent" }` — no
 *     threadId / labelIds because the message no longer exists
 *     and Gmail responds 204 with no body. The wrapper echoes
 *     the input messageId so downstream nodes have a stable
 *     reference for any audit-log step.
 */
export const deleteEmail: ActionHandler = async (input) => {
  const config = DeleteEmailConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "gmail"
      ? input.triggerEvent.accountId
      : null;

  if (config.deleteMode === "trash") {
    const result = await refreshAndRetry({
      userId: input.userId,
      provider: "gmail",
      accountId,
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
  }

  // permanent
  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "gmail",
    accountId,
    apiCall: async (accessToken) =>
      usersMessagesDelete({
        accessToken,
        messageId: config.messageId,
      }),
  });

  return {
    output: {
      messageId: result.messageId,
      deleteMode: "permanent" as const,
    },
  };
};
