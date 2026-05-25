import { slackApiRequest, type SlackOkResponse } from "./_request";

// Slack returns only `{ ok }` on success; no extra fields to model.

/**
 * Slack `chat.deleteScheduledMessage` client.
 *
 * Cancels a previously-scheduled message before it's delivered. Slack
 * returns `{ ok: true }` on success with no other useful fields.
 *
 * Slack docs: https://api.slack.com/methods/chat.deleteScheduledMessage
 *
 * NB: scheduled messages are scoped to the token that created them —
 * a bot token can only cancel messages it scheduled, and same for
 * user tokens. V1 docs called this out; V2 is bot-token-only in Slack
 * 2.1, so the constraint reduces to "this bot scheduled it."
 */
export interface ChatDeleteScheduledMessageInput {
  botToken: string;
  channel: string;
  scheduledMessageId: string;
}

export async function chatDeleteScheduledMessage(
  input: ChatDeleteScheduledMessageInput,
): Promise<void> {
  await slackApiRequest<SlackOkResponse>(
    "chat.deleteScheduledMessage",
    input.botToken,
    {
      channel: input.channel,
      scheduled_message_id: input.scheduledMessageId,
    },
  );
}
