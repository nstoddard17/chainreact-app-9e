import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { chatScheduledMessagesList } from "../api/chatScheduledMessagesList";
import { ListScheduledMessagesConfigSchema } from "./listScheduledMessages.schema";

/**
 * Slack `list_scheduled_messages` action handler.
 *
 * Bot-token only. Lists scheduled messages this bot owns. The output
 * shape matches `get_messages` so workflow templates that branch on
 * `count` / `hasMore` / `nextCursor` work uniformly.
 *
 * Each `messages` entry is Slack's raw scheduled-message object
 * (`{id, channel_id, post_at, date_created, text, ...}`) — snake_case
 * keys preserved so downstream templates index them directly.
 */
export const listScheduledMessages: ActionHandler = async (input) => {
  const config = ListScheduledMessagesConfigSchema.parse(input.config);

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

  const result = await chatScheduledMessagesList({
    botToken,
    channel: config.channel,
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
