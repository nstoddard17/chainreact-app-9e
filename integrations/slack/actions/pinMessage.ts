import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { pinsAdd } from "../api/pinsAdd";
import { PinMessageConfigSchema } from "./pinMessage.schema";

/**
 * Slack `pin_message` action handler.
 *
 * Bot-token only. Pins the message identified by `(channel, ts)` to
 * its channel. Slack returns `already_pinned` if the message is
 * already pinned — surfaced via SlackApiError.
 *
 * Output:
 *   - `channel` — echoed from input.
 *   - `ts` — echoed from input.
 */
export const pinMessage: ActionHandler = async (input) => {
  const config = PinMessageConfigSchema.parse(input.config);

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

  await pinsAdd({
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
