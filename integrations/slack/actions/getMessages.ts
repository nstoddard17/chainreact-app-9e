import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { conversationsHistory } from "../api/conversationsHistory";
import { GetMessagesConfigSchema } from "./getMessages.schema";

/**
 * Slack `get_messages` action handler.
 *
 * Reads a paginated window of messages from a channel. Slack 2.1 covers
 * public channels (channels:history scope, already on the manifest). DMs
 * and group DMs work after Commit 8 adds `im:history` + `mpim:history`.
 * Private channels need `groups:history` — deferred to Slack 2.2.
 *
 * Output:
 *   - `messages` — Slack's `messages` array verbatim. Downstream nodes
 *     index into individual entries (`{{nodeId.messages[0].text}}`).
 *   - `count` — length of `messages`. Convenience for branching.
 *   - `hasMore` — `true` when Slack indicates more pages exist.
 *   - `nextCursor` — opaque cursor for the next call; `null` at the end.
 */
export const getMessages: ActionHandler = async (input) => {
  const config = GetMessagesConfigSchema.parse(input.config);

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

  const result = await conversationsHistory({
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
