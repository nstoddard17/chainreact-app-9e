import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { usersMessagesModify } from "../api/usersMessagesModify";
import { ArchiveEmailConfigSchema } from "./archiveEmail.schema";

/**
 * Gmail `archive_email` — removes the `INBOX` system label via
 * `users.messages.modify`. The message persists in `All Mail`; it
 * simply stops appearing in the inbox.
 *
 * To restore a previously-archived message, workflow authors compose
 * `add_label` with `labelIds: ["INBOX"]`.
 */
export const archiveEmail: ActionHandler = async (input) => {
  const config = ArchiveEmailConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "gmail"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "gmail",
    accountId,
    apiCall: async (accessToken) =>
      usersMessagesModify({
        accessToken,
        messageId: config.messageId,
        removeLabelIds: ["INBOX"],
      }),
  });

  return {
    output: {
      messageId: result.id,
      threadId: result.threadId,
      labelIds: result.labelIds,
    },
  };
};
