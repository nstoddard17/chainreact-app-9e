import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { conversationsSetTopic } from "../../api/conversationsSetTopic";
import { SetChannelTopicConfigSchema } from "./setChannelTopic.schema";

/**
 * Slack `set_channel_topic` action handler (Slack 2.3 Commit 3).
 *
 * Output:
 *   - `channel` — Slack's updated channel object verbatim.
 *   - `topic` — the stored topic string (Slack may strip / truncate).
 */
export const setChannelTopic: ActionHandler = async (input) => {
  const config = SetChannelTopicConfigSchema.parse(input.config);

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

  const result = await conversationsSetTopic({
    botToken,
    channel: config.channel,
    topic: config.topic,
  });
  const ch = result.channel as Record<string, unknown>;
  const topicValue =
    ch.topic && typeof ch.topic === "object" && "value" in ch.topic
      ? (ch.topic as { value?: unknown }).value
      : undefined;

  return {
    output: {
      channel: result.channel,
      topic: typeof topicValue === "string" ? topicValue : config.topic,
    },
  };
};
