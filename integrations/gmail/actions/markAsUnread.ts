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

  const providerAccountId =
    input.triggerEvent.provider === "gmail"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "gmail",
    providerAccountId,
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
