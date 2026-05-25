import { slackApiRequest, type SlackOkResponse } from "./_request";

/**
 * Slack `conversations.kick` client (Slack 2.3 Commit 3).
 *
 * Removes a single user from a channel. Slack docs:
 *   https://api.slack.com/methods/conversations.kick
 *
 * Scope: `channels:manage` for public; `groups:write` for private.
 *
 * Slack returns `{ ok: true }` only; no extra body.
 */
export interface ConversationsKickInput {
  botToken: string;
  channel: string;
  user: string;
}

export async function conversationsKick(
  input: ConversationsKickInput,
): Promise<void> {
  await slackApiRequest<SlackOkResponse>(
    "conversations.kick",
    input.botToken,
    { channel: input.channel, user: input.user },
  );
}
