import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { conversationsJoin } from "../../api/conversationsJoin";
import { JoinChannelConfigSchema } from "./joinChannel.schema";

/**
 * Slack `join_channel` action handler (Slack 2.3 Commit 3).
 *
 * The bot joins the channel itself (bot-token).
 *
 * Output:
 *   - `channel` — Slack's joined channel object verbatim.
 *   - `id` / `name` — convenience flat fields.
 */
export const joinChannel: ActionHandler = async (input) => {
  const config = JoinChannelConfigSchema.parse(input.config);

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

  const result = await conversationsJoin({ botToken, channel: config.channel });
  const ch = result.channel as Record<string, unknown>;

  return {
    output: { channel: result.channel, id: ch.id, name: ch.name },
  };
};
