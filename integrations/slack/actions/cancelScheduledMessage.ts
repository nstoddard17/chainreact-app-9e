import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { chatDeleteScheduledMessage } from "../api/chatDeleteScheduledMessage";
import { CancelScheduledMessageConfigSchema } from "./cancelScheduledMessage.schema";

/**
 * Slack `cancel_scheduled_message` action handler.
 *
 * Bot-token only. The bot can only cancel messages it scheduled (Slack
 * scopes scheduled-message visibility to the token that created them).
 *
 * Output:
 *   - `channel` — echoed from input (Slack returns no useful body).
 *   - `scheduledMessageId` — echoed from input.
 *   - `cancelled` — `true` (handler only resolves on success; failures
 *     throw SlackApiError before reaching the output).
 */
export const cancelScheduledMessage: ActionHandler = async (input) => {
  const config = CancelScheduledMessageConfigSchema.parse(input.config);

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

  await chatDeleteScheduledMessage({
    botToken,
    channel: config.channel,
    scheduledMessageId: config.scheduledMessageId,
  });

  return {
    output: {
      channel: config.channel,
      scheduledMessageId: config.scheduledMessageId,
      cancelled: true,
    },
  };
};
