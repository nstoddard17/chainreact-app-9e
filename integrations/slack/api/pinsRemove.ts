import { slackApiRequest, type SlackOkResponse } from "./_request";

/**
 * Slack `pins.remove` client.
 *
 * Unpins a message from a channel. Slack returns `{ ok: true }` on
 * success with no useful body.
 *
 * Slack docs: https://api.slack.com/methods/pins.remove
 *
 * Common error codes: `not_pinned`, `message_not_found`,
 * `channel_not_found`, `not_in_channel`, `permission_denied`.
 */
export interface PinsRemoveInput {
  botToken: string;
  channel: string;
  timestamp: string;
}

export async function pinsRemove(input: PinsRemoveInput): Promise<void> {
  await slackApiRequest<SlackOkResponse>(
    "pins.remove",
    input.botToken,
    {
      channel: input.channel,
      timestamp: input.timestamp,
    },
  );
}
