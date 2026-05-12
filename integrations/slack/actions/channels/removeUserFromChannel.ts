import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { conversationsKick } from "../../api/conversationsKick";
import { RemoveUserFromChannelConfigSchema } from "./removeUserFromChannel.schema";

/**
 * Slack `remove_user_from_channel` action handler (Slack 2.3 Commit 3).
 *
 * Removes a single user from a channel via conversations.kick.
 *
 * Output:
 *   - `channel`, `user` — echoed (Slack returns no body).
 */
export const removeUserFromChannel: ActionHandler = async (input) => {
  const config = RemoveUserFromChannelConfigSchema.parse(input.config);

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

  await conversationsKick({
    botToken,
    channel: config.channel,
    user: config.user,
  });

  return { output: { channel: config.channel, user: config.user } };
};
