import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { usersMessagesModify } from "../api/usersMessagesModify";
import { MarkAsReadConfigSchema } from "./markAsRead.schema";

/**
 * Gmail `mark_as_read` — clears the `UNREAD` system label via
 * `users.messages.modify`. The "read" state in Gmail is the absence
 * of the UNREAD label; removing it marks the message read.
 *
 * Same shape as `addLabel` / `removeLabel`: single messageId, single
 * `refreshAndRetry`-wrapped `usersMessagesModify` call, identical
 * output `{ messageId, threadId, labelIds }`.
 */
export const markAsRead: ActionHandler = async (input) => {
  const config = MarkAsReadConfigSchema.parse(input.config);

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
        removeLabelIds: ["UNREAD"],
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
