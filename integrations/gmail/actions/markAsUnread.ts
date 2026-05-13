import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { usersMessagesModify } from "../api/usersMessagesModify";
import { MarkAsUnreadConfigSchema } from "./markAsUnread.schema";

/**
 * Gmail `mark_as_unread` — adds the `UNREAD` system label via
 * `users.messages.modify`. Inverse of `mark_as_read`.
 */
export const markAsUnread: ActionHandler = async (input) => {
  const config = MarkAsUnreadConfigSchema.parse(input.config);

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
        addLabelIds: ["UNREAD"],
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
