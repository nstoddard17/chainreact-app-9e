import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { conversationsLeave } from "../../api/conversationsLeave";
import { LeaveChannelConfigSchema } from "./leaveChannel.schema";

/**
 * Slack `leave_channel` action handler (Slack 2.3 Commit 3).
 *
 * The bot leaves the channel itself (bot-token).
 *
 * Output:
 *   - `channel` — the left channel id (echoed; Slack returns no body).
 */
export const leaveChannel: ActionHandler = async (input) => {
  const config = LeaveChannelConfigSchema.parse(input.config);

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

  await conversationsLeave({ botToken, channel: config.channel });

  return { output: { channel: config.channel } };
};
