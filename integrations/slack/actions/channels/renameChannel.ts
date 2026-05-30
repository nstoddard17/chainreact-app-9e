import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { conversationsRename } from "../../api/conversationsRename";
import { RenameChannelConfigSchema } from "./renameChannel.schema";

/**
 * Slack `rename_channel` action handler (Slack 2.3 Commit 3).
 *
 * Output:
 *   - `channel` — Slack's updated channel object verbatim.
 *   - `id` / `name` — convenience flat fields.
 */
export const renameChannel: ActionHandler = async (input) => {
  const config = RenameChannelConfigSchema.parse(input.config);

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

  const result = await conversationsRename({
    botToken,
    channel: config.channel,
    name: config.name,
  });
  const ch = result.channel as Record<string, unknown>;

  return {
    output: { channel: result.channel, id: ch.id, name: ch.name },
  };
};
