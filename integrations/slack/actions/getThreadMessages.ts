import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { conversationsReplies } from "../api/conversationsReplies";
import { GetThreadMessagesConfigSchema } from "./getThreadMessages.schema";

/**
 * Slack `get_thread_messages` action handler.
 *
 * Reads a thread (parent + replies) via `conversations.replies`. Slack
 * returns the parent at `messages[0]` and replies in chronological
 * order from `messages[1..]`.
 *
 * Output shape mirrors get_messages so workflow templates that branch on
 * `count` / `hasMore` / `nextCursor` work uniformly between the two
 * actions.
 */
export const getThreadMessages: ActionHandler = async (input) => {
  const config = GetThreadMessagesConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "slack"
      ? input.triggerEvent.accountId
      : null;

  const integration = await getActiveForExecution(input.userId, "slack", accountId);
  if (!integration) {
    throw new Error(
      accountId
        ? `No active Slack integration found for workspace ${accountId}.`
        : "No active Slack integration found for this user.",
    );
  }

  const botToken = decryptToken(integration.accessTokenEncrypted);

  const result = await conversationsReplies({
    botToken,
    channel: config.channel,
    ts: config.threadTs,
    limit: config.limit,
    oldest: config.oldest,
    latest: config.latest,
    cursor: config.cursor,
  });

  return {
    output: {
      messages: result.messages,
      count: result.messages.length,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    },
  };
};
