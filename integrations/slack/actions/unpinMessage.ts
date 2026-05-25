import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { pinsRemove } from "../api/pinsRemove";
import { UnpinMessageConfigSchema } from "./unpinMessage.schema";

/**
 * Slack `unpin_message` action handler.
 *
 * Bot-token only. Unpins the message identified by `(channel, ts)`.
 * Slack returns `not_pinned` if the message wasn't pinned — surfaced
 * via SlackApiError.
 *
 * Output:
 *   - `channel` — echoed from input.
 *   - `ts` — echoed from input.
 */
export const unpinMessage: ActionHandler = async (input) => {
  const config = UnpinMessageConfigSchema.parse(input.config);

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

  await pinsRemove({
    botToken,
    channel: config.channel,
    timestamp: config.ts,
  });

  return {
    output: {
      channel: config.channel,
      ts: config.ts,
    },
  };
};
