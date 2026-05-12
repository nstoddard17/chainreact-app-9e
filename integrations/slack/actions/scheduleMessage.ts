import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { chatScheduleMessage } from "../api/chatScheduleMessage";
import { parsePostAt } from "./parsePostAt";
import { ScheduleMessageConfigSchema } from "./scheduleMessage.schema";

/**
 * Slack `schedule_message` action handler.
 *
 * Bot-token only. The post time (`postAt`) comes from the resolved
 * config as a string and is converted to Unix seconds via
 * `parsePostAt` — which rejects naive ISO strings and refuses to
 * silently default. Slack server-side rejects past or too-distant
 * timestamps with `time_in_past` / `time_too_far`; we surface those
 * via SlackApiError.
 *
 * Output:
 *   - `channel` — channel id Slack confirmed.
 *   - `scheduledMessageId` — Slack's id; pass to `cancel_scheduled_message`
 *     to cancel before delivery.
 *   - `postAt` — Unix-second timestamp Slack accepted (echoed).
 */
export const scheduleMessage: ActionHandler = async (input) => {
  const config = ScheduleMessageConfigSchema.parse(input.config);
  const postAtSeconds = parsePostAt(config.postAt);

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

  const result = await chatScheduleMessage({
    botToken,
    channel: config.channel,
    text: config.text,
    postAt: postAtSeconds,
    threadTs: config.threadTs,
  });

  return {
    output: {
      channel: result.channel,
      scheduledMessageId: result.scheduledMessageId,
      postAt: result.postAt,
    },
  };
};
