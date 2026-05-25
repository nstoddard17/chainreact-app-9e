import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { usersMessagesModify } from "../api/usersMessagesModify";
import { AddLabelConfigSchema } from "./addLabel.schema";

/**
 * Gmail `users.messages.modify` (addLabelIds) action handler.
 *
 * Gmail 2.2 Commit 1 — message-level label addition. Reuses
 * `usersMessagesModify` from Gmail 2.1 Commit 2 (originally
 * introduced for the labels-on-send path of `send_email`). Same
 * wrapper, different caller: workflow authors who want to label an
 * already-existing message reach this handler instead of going
 * through `send_email`'s post-send modify step.
 *
 * Account resolution mirrors every other Gmail handler — Gmail
 * trigger → use trigger's accountId; otherwise null → dispatcher
 * picks the user's single active Gmail integration.
 *
 * Output mirrors `usersMessagesModify` response: `{ messageId,
 * threadId, labelIds }` where labelIds is Gmail's post-modify state
 * (typically the union of prior labels + the requested adds, deduped
 * server-side). Downstream actions can reference the full label set
 * for follow-up filtering / branching.
 */
export const addLabel: ActionHandler = async (input) => {
  const config = AddLabelConfigSchema.parse(input.config);

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
        addLabelIds: config.labelIds,
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
