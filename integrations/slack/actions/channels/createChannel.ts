import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { conversationsCreate } from "../../api/conversationsCreate";
import { CreateChannelConfigSchema } from "./createChannel.schema";

/**
 * Slack `create_channel` action handler (Slack 2.3 Commit 3).
 *
 * Single-purpose port: creates a channel. Does NOT chain post-create
 * operations like invite or initial messages — workflow authors
 * compose those explicitly (Slack 2.3 plan §5.2).
 *
 * Output:
 *   - `channel` — Slack's channel object verbatim.
 *   - `id` / `name` / `is_private` — convenience flat fields.
 */
export const createChannel: ActionHandler = async (input) => {
  const config = CreateChannelConfigSchema.parse(input.config);

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
  const result = await conversationsCreate({
    botToken,
    name: config.name,
    isPrivate: config.isPrivate,
  });

  const ch = result.channel as Record<string, unknown>;
  return {
    output: {
      channel: result.channel,
      id: ch.id,
      name: ch.name,
      is_private: ch.is_private,
    },
  };
};
