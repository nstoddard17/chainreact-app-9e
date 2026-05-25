import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { chatDelete } from "../api/chatDelete";
import { DeleteMessageConfigSchema } from "./deleteMessage.schema";

/**
 * Slack `delete_message` action handler.
 *
 * Bot-token only. Slack permits deletion of messages the bot posted; for
 * messages posted by users, Slack returns `cant_delete_message` unless
 * the workspace has admin-level scopes. Caller sees the Slack error
 * code directly through SlackApiError.
 *
 * Output:
 *   - `channel` — channel id Slack confirmed.
 *   - `ts` — deleted message id (echoed back).
 */
export const deleteMessage: ActionHandler = async (input) => {
  const config = DeleteMessageConfigSchema.parse(input.config);

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

  const result = await chatDelete({
    botToken,
    channel: config.channel,
    ts: config.ts,
  });

  return {
    output: {
      channel: result.channel,
      ts: result.ts,
    },
  };
};
