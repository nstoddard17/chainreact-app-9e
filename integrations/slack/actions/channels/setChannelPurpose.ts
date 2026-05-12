import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { conversationsSetPurpose } from "../../api/conversationsSetPurpose";
import { SetChannelPurposeConfigSchema } from "./setChannelPurpose.schema";

/**
 * Slack `set_channel_purpose` action handler (Slack 2.3 Commit 3).
 *
 * Output:
 *   - `channel` — Slack's updated channel object verbatim.
 *   - `purpose` — the stored purpose string.
 */
export const setChannelPurpose: ActionHandler = async (input) => {
  const config = SetChannelPurposeConfigSchema.parse(input.config);

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

  const result = await conversationsSetPurpose({
    botToken,
    channel: config.channel,
    purpose: config.purpose,
  });
  const ch = result.channel as Record<string, unknown>;
  const purposeValue =
    ch.purpose && typeof ch.purpose === "object" && "value" in ch.purpose
      ? (ch.purpose as { value?: unknown }).value
      : undefined;

  return {
    output: {
      channel: result.channel,
      purpose: typeof purposeValue === "string" ? purposeValue : config.purpose,
    },
  };
};
