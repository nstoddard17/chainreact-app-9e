import { slackApiRequest, type SlackOkResponse } from "./_request";

/**
 * Slack `conversations.leave` client (Slack 2.3 Commit 3).
 *
 * Removes the calling user (the bot) from a channel. Slack docs:
 *   https://api.slack.com/methods/conversations.leave
 *
 * Scope: the bot leaves its own membership — Slack does not require
 * extra scope beyond the bot's existing membership. `channels:manage`
 * and `groups:write` cover the public/private admin path that ends
 * up calling leave, so the action is reachable in 2.3.
 */
export interface ConversationsLeaveInput {
  botToken: string;
  channel: string;
}

export async function conversationsLeave(
  input: ConversationsLeaveInput,
): Promise<void> {
  await slackApiRequest<SlackOkResponse>(
    "conversations.leave",
    input.botToken,
    { channel: input.channel },
  );
}
