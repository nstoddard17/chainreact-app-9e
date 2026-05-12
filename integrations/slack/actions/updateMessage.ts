import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { chatUpdate } from "../api/chatUpdate";
import { UpdateMessageConfigSchema } from "./updateMessage.schema";

/**
 * Slack `update_message` action handler.
 *
 * Bot-token only — messages posted by users cannot be edited by the bot
 * (Slack returns `cant_update_message`). V1's user-token fallback is
 * deferred (P-S1). Caller can pin the upstream-message `ts` from a
 * send_channel_message / send_direct_message output and reliably edit it.
 *
 * Output:
 *   - `channel` — channel id Slack confirmed.
 *   - `ts` — message id (unchanged after edit).
 *   - `text` — the new text Slack now stores.
 */
export const updateMessage: ActionHandler = async (input) => {
  const config = UpdateMessageConfigSchema.parse(input.config);

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

  const result = await chatUpdate({
    botToken,
    channel: config.channel,
    ts: config.ts,
    text: config.text,
  });

  return {
    output: {
      channel: result.channel,
      ts: result.ts,
      text: result.text,
    },
  };
};
