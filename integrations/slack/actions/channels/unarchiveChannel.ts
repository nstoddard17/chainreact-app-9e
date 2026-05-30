import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { conversationsUnarchive } from "../../api/conversationsUnarchive";
import { UnarchiveChannelConfigSchema } from "./unarchiveChannel.schema";

/**
 * Slack `unarchive_channel` action handler (Slack 2.3 Commit 3).
 *
 * Output:
 *   - `channel` — the unarchived channel id (echoed; Slack returns no body).
 */
export const unarchiveChannel: ActionHandler = async (input) => {
  const config = UnarchiveChannelConfigSchema.parse(input.config);

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

  await conversationsUnarchive({ botToken, channel: config.channel });

  return { output: { channel: config.channel } };
};
