import { slackApiRequest, type SlackOkResponse } from "./_request";

/**
 * Slack `pins.add` client.
 *
 * Pins a message to a channel. Slack returns `{ ok: true }` on success
 * with no useful body.
 *
 * Slack docs: https://api.slack.com/methods/pins.add
 *
 * Common error codes: `already_pinned`, `message_not_found`,
 * `channel_not_found`, `not_in_channel`, `permission_denied`,
 * `no_pin_permission`.
 */
export interface PinsAddInput {
  botToken: string;
  channel: string;
  timestamp: string;
}

export async function pinsAdd(input: PinsAddInput): Promise<void> {
  await slackApiRequest<SlackOkResponse>(
    "pins.add",
    input.botToken,
    {
      channel: input.channel,
      timestamp: input.timestamp,
    },
  );
}
