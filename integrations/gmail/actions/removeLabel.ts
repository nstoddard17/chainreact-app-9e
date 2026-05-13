import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { usersMessagesModify } from "../api/usersMessagesModify";
import { RemoveLabelConfigSchema } from "./removeLabel.schema";

/**
 * Gmail `users.messages.modify` (removeLabelIds) action handler.
 *
 * Mirrors `addLabel` — same shape, same wrapper, opposite operation.
 * `removeLabelIds` is forwarded; `addLabelIds` is never set.
 *
 * Account resolution + output shape match `addLabel` for downstream
 * consistency: workflow authors chaining add/remove pairs get the
 * same `{ messageId, threadId, labelIds }` shape from both handlers.
 */
export const removeLabel: ActionHandler = async (input) => {
  const config = RemoveLabelConfigSchema.parse(input.config);

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
        removeLabelIds: config.labelIds,
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
