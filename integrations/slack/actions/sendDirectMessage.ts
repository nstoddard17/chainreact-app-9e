import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { chatPostMessage } from "../api/chatPostMessage";
import { conversationsOpen } from "../api/conversationsOpen";
import { SendDirectMessageConfigSchema } from "./sendDirectMessage.schema";

/**
 * Slack `send_direct_message` action handler.
 *
 * Two-step: open the DM channel via `conversations.open` (idempotent —
 * Slack returns the existing channel id if one already exists between
 * the bot's authed user and the target user), then post via
 * `chat.postMessage`. The open call is safe to repeat on retry.
 *
 * Output:
 *   - `channel` — DM channel id Slack resolved (`D…`).
 *   - `ts` — Slack message id of the DM (timestamp).
 *   - `userId` — recipient user id (echoed back for downstream nodes).
 *   - `message` — Slack's posted-message payload (server-resolved).
 */
export const sendDirectMessage: ActionHandler = async (input) => {
  const config = SendDirectMessageConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "slack"
      ? input.triggerEvent.providerAccountId
      : null;

  const integration = await getActiveForExecution(input.accountId, "slack", accountId);
  if (!integration) {
    throw new Error(
      accountId
        ? `No active Slack integration found for workspace ${accountId}.`
        : "No active Slack integration found for this user.",
    );
  }

  const botToken = decryptToken(integration.accessTokenEncrypted);

  const { channelId } = await conversationsOpen({
    botToken,
    users: config.userId,
  });

  const result = await chatPostMessage({
    botToken,
    channel: channelId,
    text: config.text,
    threadTs: config.threadTs,
  });

  return {
    output: {
      channel: result.channel,
      ts: result.ts,
      userId: config.userId,
      message: result.message,
    },
  };
};
